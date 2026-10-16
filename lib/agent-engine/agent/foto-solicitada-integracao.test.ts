import { expect, it, vi } from 'vitest';
import {
  enviarComFotos, prepararFotosDoProduto, resolverCodigoFotoNoPedido,
  type FotoParaEnvio,
} from './fotos-do-produto';
import { prometeFotoSemAnexo } from './pedido-de-foto';

const org = 'aaaaaaaa-0000-4000-8000-000000000001';
const conv = 'bbbbbbbb-0000-4000-8000-000000000001';
const product = 'cccccccc-0000-4000-8000-000000000001';
const photo = `${org}/${product}/11111111-2222-4333-8444-555555555555.jpg`;

it('pedido com SKU sem produto_codigo prepara e envia imagem, não só a frase de reenvio', async () => {
  const pedido = 'Envíame otra vez la foto del taladro SF777';
  const body = 'Claro 😊 Te la reenvío aquí.';
  const query = vi.fn(async (sql: string, _params: unknown[]) => {
    if (sql.includes('select codigo')) return { rows: [{ codigo: 'SF777' }] };
    if (sql.includes('from catalog_products')) return { rows: [{ id: product, fotos: [photo] }] };
    throw new Error('pedido explícito não deve suprimir foto anterior');
  });
  const db = { query } as never;
  const codigo = await resolverCodigoFotoNoPedido(db, org, pedido);
  expect(codigo).toBe('SF777');
  expect(query.mock.calls[0]?.[1]).toEqual([org, ['sf777']]);
  const copiar = vi.fn(async () => true);
  const r = await prepararFotosDoProduto(db, copiar, {
    tenantId: org, conversationId: conv, codigo: codigo!, pedidoCliente: pedido,
  });
  if (!r.ok) throw new Error(r.message);
  expect(prometeFotoSemAnexo(body, pedido, r.fotos.length)).toBe(false);
  const enviarTexto = vi.fn(async () => ({ kind: 'sent' }));
  const enviarFoto = vi.fn(async (_foto: FotoParaEnvio, _legenda: string) => ({ kind: 'sent' }));
  await enviarComFotos(body, r.fotos, {
    enviarTexto, enviarFoto, sleep: async () => undefined, jitter: () => 0,
  });
  expect(copiar).toHaveBeenCalledOnce();
  expect(enviarTexto).not.toHaveBeenCalled();
  expect(enviarFoto).toHaveBeenCalledExactlyOnceWith({
    storagePath: `${org}/${conv}/catalogo-11111111-2222-4333-8444-555555555555.jpg`,
    mime: 'image/jpeg',
  }, body);
});

it.each([
  '¿Cuánto cuesta el SF777?',
  'No me envíes fotos del SF777',
  'Envíame otra vez la foto del taladro',
])('sem pedido com SKU não procura código no histórico nem adivinha: %s', async pedido => {
  const query = vi.fn();
  expect(await resolverCodigoFotoNoPedido({ query } as never, org, pedido)).toBeUndefined();
  expect(query).not.toHaveBeenCalled();
});

it.each([{ rows: [] }, { rows: [{ codigo: 'SF777' }, { codigo: 'SF778' }] }])('sem correspondência única não escolhe produto', async ({ rows }) => {
  const query = vi.fn(async () => ({ rows }));
  const codigo = await resolverCodigoFotoNoPedido({ query } as never, org, 'Envíame fotos SF777 y SF778');
  expect(codigo).toBeUndefined();
  expect(prometeFotoSemAnexo('Te la reenvío aquí.', 'Envíame fotos SF777 y SF778', 0)).toBe(true);
});

