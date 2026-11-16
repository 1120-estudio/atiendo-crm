import "server-only";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";

/** Redirects are refused so credentials cannot be forwarded to another host. */
export async function buscarSeguro(url: string, authorization?: string): Promise<Response> {
  assertSafeOutboundUrl(url);
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password) throw new Error("url_invalida");
  await assertDestinoResolvidoSeguro(u.hostname);
  const response = await fetch(u, {
    headers: authorization ? { Authorization: authorization } : {},
    redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`woocommerce_http_${response.status}`);
  return response;
}
export async function jsonLimitado(response: Response, max = 8 * 1024 * 1024): Promise<unknown> {
  if (!response.body) throw new Error("resposta_vazia");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error("resposta_muito_grande");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
