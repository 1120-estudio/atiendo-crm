import { z } from "zod";

export const conexaoSchema = z.object({
  url: z.string().url().max(2000).refine(v => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
  }, "Use la URL HTTPS de la tienda, sin credenciales ni parámetros."),
  consumer_key: z.string().regex(/^ck_[a-f0-9]{40}$/),
  consumer_secret: z.string().regex(/^cs_[a-f0-9]{40}$/),
  preservar_conteudo: z.boolean().default(true),
});
export const produtoWooSchema = z.object({
  id: z.number().int().positive(), name: z.string().default(""), sku: z.string().default(""),
  type: z.string().default("simple"), status: z.string().default("publish"),
  description: z.string().default(""), short_description: z.string().default(""),
  price: z.string(), regular_price: z.string().default(""), sale_price: z.string().default(""),
  permalink: z.string().default(""), stock_status: z.string().default("instock"),
  manage_stock: z.boolean().default(false), stock_quantity: z.number().nullable().default(null),
  images: z.array(z.object({ id: z.number(), src: z.string().url(), alt: z.string().optional() })).default([]),
  attributes: z.array(z.object({ name: z.string(), option: z.string().optional(), options: z.array(z.string()).optional() })).default([]),
  categories: z.array(z.object({ name: z.string() })).default([]),
}).passthrough();
export type ProdutoWoo = z.infer<typeof produtoWooSchema>;

export function centavosWoo(valor: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(valor)) return null;
  const [inteiro, decimal = ""] = valor.split(".");
  const n = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(n) ? n : null;
}
export function textoWoo(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
export function mapearProduto(p: ProdutoWoo, moeda: string, pai?: ProdutoWoo) {
  const preco = p.price === "" ? 0 : centavosWoo(p.price);
  if (preco === null) throw new Error("precio_invalido");
  const atributos = p.attributes.map(a => `${a.name}: ${a.option ?? a.options?.join(", ") ?? ""}`).join("; ");
  const sku = p.sku.trim();
  // WooCommerce can expose the parent's SKU for variations without their own.
  // Keep that source SKU in the ficha, but give each sellable variant its own code.
  const sufixo = `-V${p.id}`;
  const codigo = pai && sku && sku === pai.sku.trim()
    ? `${sku.slice(0, 60 - sufixo.length)}${sufixo}`
    : sku || `WOO-${p.id}`;
  return {
    codigo,
    nome: (pai ? `${pai.name} ${atributos}` : p.name).slice(0, 200),
    descricao: [textoWoo(pai?.short_description ?? p.short_description), textoWoo(pai?.description ?? p.description), textoWoo(p.description), atributos].filter(Boolean).join("\n"),
    categoria: (pai?.categories ?? p.categories).map(c => c.name).join(", ").slice(0, 80),
    preco_cents: preco, moeda, controla_estoque: p.manage_stock,
    quantidade: Math.max(0, Math.floor(p.stock_quantity ?? 0)), origem: "woocommerce",
    woo_id: p.id, woo_parent_id: pai?.id ?? null,
    ficha_woocommerce: { ...p, parent: pai ?? null, currency: moeda },
    woo_disponivel: p.price !== "" && p.stock_status === "instock" && p.status === "publish" && (!pai || pai.status === "publish"),
  };
}
