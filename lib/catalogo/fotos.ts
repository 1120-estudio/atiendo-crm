/**
 * AS FOTOS DO PRODUTO — as regras que a rota, a tela e o agente compartilham.
 *
 * O banco guarda CAMINHOS em `catalog-photos` (migration 0390), na ordem da
 * tela; a primeira é a capa. Os números abaixo são os do bucket: um teto aqui
 * diferente do de lá faria a rota aceitar o que o Storage recusa, e o erro que
 * chegaria à tela seria "erro ao subir a foto".
 */

export const BUCKET_DAS_FOTOS = "catalog-photos";

/** 5 MB: o `file_size_limit` do bucket, e o teto de imagem do WhatsApp oficial. */
export const TAMANHO_MAXIMO_DA_FOTO = 5 * 1024 * 1024;

/**
 * O formato é decidido pela ASSINATURA dos bytes — `farejarTipo`, o mesmo
 * farejador do logo (`lib/branding/logo-arquivo.ts`), que aceita exatamente
 * JPEG, PNG e WebP estático. Não pelo `content-type` que o navegador declarou: esse é do
 * cliente, e o arquivo vai ser servido ao WhatsApp de outra pessoa.
 */
import { farejarTipo as farejarLogo } from "@/lib/branding/logo-arquivo";
export type TipoDeFoto = "image/jpeg" | "image/png" | "image/webp";
export function farejarTipo(bytes: Uint8Array): TipoDeFoto | null {
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(String.fromCharCode(...bytes.slice(12, 16)))) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
    if (size + 8 !== bytes.length) return null;
    if (String.fromCharCode(...bytes.slice(12, 16)) === "VP8X" && (bytes[20]! & 2)) return null;
    return "image/webp";
  }
  return farejarLogo(bytes);
}
export function extensaoDe(tipo: TipoDeFoto): "png" | "jpg" | "webp" {
  return tipo === "image/webp" ? "webp" : tipo === "image/png" ? "png" : "jpg";
}

const FORMA_DO_ARQUIVO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/**
 * O caminho É desta organização e deste produto, na forma exata que a rota gera?
 *
 * ⚠️ Quem LÊ o caminho confere, não só quem escreve. A coluna é gravável pelo
 * PostgREST por qualquer `manager` da organização, e a leitura do arquivo é por
 * service role, que não tem RLS: sem esta conferência, um caminho de outra
 * organização gravado na linha viraria foto alheia assinada na tela ou enviada
 * pelo agente — ou, na remoção, arquivo alheio APAGADO pela rota (o mesmo
 * ataque que `podeApagar` fecha no logo).
 */
export function fotoPertenceAoProduto(caminho: string, orgId: string, produtoId: string): boolean {
  const prefixo = `${orgId}/${produtoId}/`;
  return caminho.startsWith(prefixo) && FORMA_DO_ARQUIVO.test(caminho.slice(prefixo.length));
}

export function mimeDaFoto(caminho: string): TipoDeFoto {
  if (caminho.endsWith(".webp")) return "image/webp";
  return caminho.endsWith(".png") ? "image/png" : "image/jpeg";
}

/**
 * A nova ordem que a tela mandou: só reordena e remove, nunca acrescenta.
 *
 * Foto nova entra pelo upload, que é quem confere os bytes. Aceitar um caminho
 * novo aqui seria aceitar um arquivo que ninguém conferiu — ou o de outro
 * produto.
 */
export function conferirNovaOrdem(
  atual: readonly string[],
  nova: readonly string[],
): { ok: true; removidas: string[] } | { ok: false } {
  if (new Set(nova).size !== nova.length) return { ok: false };
  if (nova.some((c) => !atual.includes(c))) return { ok: false };
  return { ok: true, removidas: atual.filter((c) => !nova.includes(c)) };
}
