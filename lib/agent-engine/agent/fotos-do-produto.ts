/**
 * A FOTO VAI JUNTO — o agente apresenta o produto com a foto do catálogo.
 *
 * Ideia de @vgamkt, a partir do #1130 (lá, sob medida para uma loja de motos);
 * aqui, para todo nicho que cadastra produto com foto (migration 0390).
 *
 * O caminho do envio é o que o handler de mensagens JÁ sabe mandar: mídia com
 * `media_storage_path` em `whatsapp-media/<org>/<conversa>/…`, URL assinada curta
 * para o canal, nunca base64. Para chegar lá, a foto é COPIADA do catálogo para
 * a pasta da conversa. É essa cópia que a conversa possui: a inbox a mostra, a
 * LGPD a apaga junto com a conversa — e o catálogo não perde nada.
 *
 * O destino é determinístico (`catalogo-<arquivo>`): reenviar a mesma foto na
 * mesma conversa, ou o replay de um job que caiu depois da cópia, reaproveita o
 * arquivo em vez de encher a cota de Storage do cliente com duplicatas.
 */
import sharp from 'sharp';

import { BUCKET_DAS_FOTOS, fotoPertenceAoProduto, mimeDaFoto } from '@/lib/catalogo/fotos';
import { createAdminClient } from '@/lib/supabase/admin';

import type { Queryable } from '../queue/queue';
import { OK_KINDS, type BubbleOutcome } from './split-message';
import { solicitaFoto } from './pedido-de-foto';

/** Limite do WhatsApp para legenda, mantido para compatibilidade com consumidores existentes. */
export const LIMITE_DA_LEGENDA = 1024;

const BUCKET_DA_CONVERSA = 'whatsapp-media';
const TAMANHO_MAXIMO_JPEG = 5_000_000;

export interface FotoParaEnvio {
  /** caminho em `whatsapp-media`, dentro da pasta da conversa */
  storagePath: string;
  mime: string;
}

/** Copia do catálogo para a conversa. `true` = o arquivo está no destino. */
export type CopiarFoto = (origem: string, destino: string) => Promise<boolean>;

interface Log {
  warn(msg: string, fields?: Record<string, unknown>): void;
}

/** O catálogo mantém o WebP. Só a cópia enviada à conversa vira JPEG. */
async function guardarFotoComoJpeg(origem: string, destino: string) {
  const storage = createAdminClient().storage;
  const { data, error } = await storage.from(BUCKET_DAS_FOTOS).download(origem);
  if (error) return error;
  const jpeg = await sharp(Buffer.from(await data.arrayBuffer()), { limitInputPixels: 25_000_000 })
    .autoOrient()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer();
  if (jpeg.length > TAMANHO_MAXIMO_JPEG) {
    throw new Error('JPEG ultrapassa o limite de tamanho da foto');
  }
  const resultado = await storage.from(BUCKET_DA_CONVERSA).upload(destino, jpeg, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  return resultado.error;
}

export function copiarFotoNoStorage(log: Log): CopiarFoto {
  return async (origem, destino) => {
    try {
      const error = mimeDaFoto(origem) === 'image/webp'
        ? await guardarFotoComoJpeg(origem, destino)
        : (await createAdminClient()
          .storage.from(BUCKET_DAS_FOTOS)
          .copy(origem, destino, { destinationBucket: BUCKET_DA_CONVERSA })).error;
      if (!error) return true;
      // A foto já ficou pronta em uma tentativa anterior ou concorrente.
      if (/already exists/i.test(error.message) || String((error as { statusCode?: string | number }).statusCode) === '409') return true;
      log.warn('foto do catálogo não copiada para a conversa', { detalhe: error.message.slice(0, 120) });
    } catch (error) {
      log.warn('foto do catálogo não preparada para a conversa', {
        detalhe: error instanceof Error ? error.message.slice(0, 120) : 'erro desconhecido',
      });
    }
    return false;
  };
}

export type FotosPreparadas =
  | { ok: true; fotos: FotoParaEnvio[]; tinha: number; jaEnviadas?: number }
  | { ok: false; code: 'produto_nao_encontrado'; message: string };

/**
 * Se o modelo omitir produto_codigo, só resolve um SKU escrito no pedido ATUAL
 * e confirmado como único no catálogo ativo da organização. Não adivinha pelo
 * nome, não reaproveita pedido antigo e não escolhe entre dois produtos.
 */
export async function resolverCodigoFotoNoPedido(
  db: Queryable,
  tenantId: string,
  pedido: string,
): Promise<string | undefined> {
  if (!solicitaFoto(pedido)) return undefined;
  const tokens = [...new Set((pedido.match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/gi) ?? [])
    .filter(token => /[a-z]/i.test(token) && /[0-9]/.test(token))
    .map(token => token.toLowerCase()))];
  if (tokens.length === 0) return undefined;
  const { rows } = await db.query<{ codigo: string }>(
    `select codigo from catalog_products
      where organization_id = $1 and ativo and lower(codigo) = any($2::text[])
      limit 2`,
    [tenantId, tokens],
  );
  return rows.length === 1 ? rows[0]!.codigo : undefined;
}

/**
 * Acha o produto pelo código e deixa as fotos dele prontas na pasta da conversa.
 *
 * Produto que não existe (ou está desativado) é erro de ENSINO, antes de enviar
 * qualquer coisa: o modelo corrige o código e tenta de novo. Foto que não copia
 * NÃO derruba o envio — ela fica de fora e o texto sai (degradar para só texto);
 * `tinha` deixa quem chama dizer ao modelo que faltou foto.
 */
export async function prepararFotosDoProduto(
  db: Queryable,
  copiar: CopiarFoto,
  input: { tenantId: string; conversationId: string; codigo: string; reenviar?: boolean; jobId?: string; pedidoCliente?: string },
): Promise<FotosPreparadas> {
  const { rows } = await db.query<{ id: string; fotos: string[] | null }>(
    'select id, fotos from catalog_products where organization_id = $1 and codigo = $2 and ativo',
    [input.tenantId, input.codigo.trim()],
  );
  const produto = rows[0];
  if (!produto) {
    return {
      ok: false,
      code: 'produto_nao_encontrado',
      message:
        `não há produto ativo com o código ${JSON.stringify(input.codigo)} no catálogo. Use o ` +
        '`codigo` que crm_search_products devolveu, ou envie sem produto_codigo.',
    };
  }
  // Só caminho que é DESTE produto: a linha é gravável pelo PostgREST e a cópia
  // é por service role — sem o filtro, sairia foto de outra organização.
  const deste = (produto.fotos ?? []).filter((c) =>
    fotoPertenceAoProduto(c, input.tenantId, produto.id),
  );
  const destinos = deste.map((origem) => {
    const anterior = `${input.tenantId}/${input.conversationId}/catalogo-${origem.split('/').pop()}`;
    const atual = mimeDaFoto(origem) === 'image/webp' ? `${anterior}.jpg` : anterior;
    return { origem, anterior, atual };
  });
  // Reconhece também as fotos WebP que já saíram antes da conversão.
  const caminhos = new Map(destinos.flatMap(({ anterior, atual }) => [
    [anterior, atual] as const, [atual, atual] as const,
  ]));
  // Reusar o objeto no Storage não impede um novo envio no WhatsApp. Só uma
  // saída efetivamente enviada/aceita neste atendimento evita a repetição;
  // tentativas falhas não consomem a foto. O pedido explícito permite reenviar.
  const enviadas = new Set<string>();
  if (!(input.reenviar || solicitaFoto(input.pedidoCliente ?? '')) && destinos.length > 0) {
    const { rows: anteriores } = await db.query<{ media_storage_path: string }>(
      `select distinct m.media_storage_path from messages m
         join conversations c on c.id = m.conversation_id
           and c.organization_id = m.organization_id
        where m.organization_id = $1 and m.conversation_id = $2
          and m.direction = 'outbound' and m.type = 'image'
          and m.media_storage_path = any($3::text[])
          and m.created_at >= coalesce(c.service_started_at, '-infinity'::timestamptz)
          -- Replay do próprio job preserva a sequência das fotos e as chaves
          -- idempotentes do send_ledger. A supressão é ENTRE turnos.
          and ($4::uuid is null or not exists (
            select 1 from send_ledger replay where replay.organization_id = $1
              and replay.crm_message_id = m.id and replay.job_id = $4::uuid))
          and (m.status in ('sent', 'delivered', 'read') or exists (
            select 1 from send_ledger s where s.organization_id = $1
              and s.crm_message_id = m.id and s.status in ('accepted', 'queued')))`,
      [input.tenantId, input.conversationId, [...caminhos.keys()], input.jobId ?? null],
    );
    for (const { media_storage_path } of anteriores) {
      const atual = caminhos.get(media_storage_path);
      if (atual) enviadas.add(atual);
    }
  }
  const fotos: FotoParaEnvio[] = [];
  for (const { origem, atual } of destinos) {
    if (enviadas.has(atual)) continue;
    if (await copiar(origem, atual)) fotos.push({ storagePath: atual, mime: mimeDaFoto(atual) });
  }
  return {
    ok: true, fotos, tinha: deste.length - enviadas.size,
    ...(enviadas.size > 0 ? { jaEnviadas: enviadas.size } : {}),
  };
}

/**
 * Envia o texto como mensagem independente e depois manda cada foto sem legenda.
 * Assim, o estado do texto fica separado do estado de cada mídia no send ledger:
 * se uma foto falhar e o job for reexecutado, a mensagem de texto já aceita é
 * reconhecida pela sua sequência e só as mídias pendentes voltam a ser tentadas.
 *
 * Cada foto é uma mensagem física: consulta o teto antes de enviá-la e aplica o
 * jitter entre o texto e as fotos, e também entre as próprias fotos.
 */
export async function enviarComFotos<T extends BubbleOutcome>(
  body: string,
  fotos: readonly FotoParaEnvio[],
  opts: {
    enviarTexto: (body: string) => Promise<T>;
    enviarFoto: (foto: FotoParaEnvio, legenda: string) => Promise<T>;
    sleep: (ms: number) => Promise<void>;
    jitter: () => number;
    restantes?: () => number;
  },
): Promise<T> {
  const cabeMaisUma = () => (opts.restantes?.() ?? Number.POSITIVE_INFINITY) > 0;
  let ultimo = await opts.enviarTexto(body);
  if (!OK_KINDS.has(ultimo.kind)) return ultimo;

  for (const foto of fotos) {
    if (!cabeMaisUma()) return ultimo;
    await opts.sleep(opts.jitter());
    ultimo = await opts.enviarFoto(foto, '');
    if (!OK_KINDS.has(ultimo.kind)) return ultimo;
  }
  return ultimo;
}
