import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { audit } from "@/lib/audit";
import { BUCKET_DAS_FOTOS, extensaoDe, farejarTipo, TAMANHO_MAXIMO_DA_FOTO } from "@/lib/catalogo/fotos";
import { apagarDoBucket } from "@/lib/catalogo/fotos-no-bucket";
import { buscarSeguro, jsonLimitado } from "./http";
import { mapearProduto, produtoWooSchema, type ProdutoWoo } from "./contrato";

export async function sincronizarWoo(orgId: string): Promise<boolean> {
  const db = createAdminClient();
  const lease = new Date(Date.now() + 10 * 60_000).toISOString();
  const claim = await db.rpc("fn_claim_woocommerce", { p_org: orgId, p_token: lease });
  if (claim.error) throw new Error("claim_falhou");
  if (!claim.data) return false;
  const { data: c, error: ce } = await db.from("woocommerce_connections").select("*").eq("organization_id", orgId).single();
  if (ce || !c) throw new Error("conexao_nao_encontrada");
  async function atualizar(values: Record<string, unknown>) {
    const { error } = await db.from("woocommerce_connections").update(values).eq("organization_id", orgId).eq("lease_until", lease);
    if (error) throw new Error("checkpoint_falhou");
  }
  try {
    const secret = await decryptWebhookSecret(db, c.credentials_enc);
    if (!secret) throw new Error("credenciais_indisponiveis");
    const credentials = z.object({ consumer_key: z.string(), consumer_secret: z.string() }).parse(JSON.parse(secret));
    const auth = `Basic ${Buffer.from(`${credentials.consumer_key}:${credentials.consumer_secret}`).toString("base64")}`;
    const base = `${c.url.replace(/\/$/, "")}/wp-json/wc/v3/`;
    const get = async (path: string) => jsonLimitado(await buscarSeguro(base + path, auth));
    const { data: org, error: oe } = await db.from("organizations").select("currency").eq("id", orgId).single();
    if (oe || !org?.currency) throw new Error("moeda_nao_configurada");
    // Reject price units that disagree with the organization's catalogue.
    const settings = z.array(z.object({ id: z.string(), value: z.unknown() })).parse(await get("settings/general"));
    if (settings.find(s => s.id === "woocommerce_currency")?.value !== org.currency) throw new Error("moeda_da_loja_diferente");
    const produtos = z.array(produtoWooSchema).parse(await get(`products?per_page=5&page=${c.page}&orderby=id&order=asc&status=any`));
    const save = async (p: ProdutoWoo, pai?: ProdutoWoo) => {
      const mapped = mapearProduto(p, org.currency, pai);
      if (mapped.codigo.length > 60) throw new Error("sku_muito_longo");
      let found = await db.from("catalog_products").select("id,woo_id,ativo,descricao,fotos,ficha_woocommerce").eq("organization_id", orgId).eq("woo_id", p.id).maybeSingle();
      if (found.error) throw new Error("leitura_catalogo_falhou");
      if (!found.data && p.sku.trim()) {
        found = await db.from("catalog_products").select("id,woo_id,ativo,descricao,fotos,ficha_woocommerce").eq("organization_id", orgId).eq("codigo", p.sku.trim()).maybeSingle();
        if (found.error || (found.data?.woo_id && found.data.woo_id !== p.id)) throw new Error("conflito_sku");
      }
      const old = found.data;
      const id = old?.id ?? randomUUID();
      const variationImage = produtoWooSchema.shape.images.unwrap().element.safeParse(p.image);
      const images = p.images.length ? p.images : variationImage.success ? [variationImage.data] : pai?.images ?? [];
      mapped.ficha_woocommerce.images = images;
      let fotos: string[] = old?.fotos ?? [];
      const previous = old?.ficha_woocommerce as { images?: unknown } | null;
      if (!(old && c.preservar_conteudo && fotos.length) && JSON.stringify(previous?.images) !== JSON.stringify(images)) {
        fotos = [];
        for (const image of images) {
          const response = await buscarSeguro(image.src);
          if (!response.body) throw new Error("foto_vazia");
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = []; let size = 0;
          try {
            while (true) {
              const r = await reader.read(); if (r.done) break;
              size += r.value.length; if (size > TAMANHO_MAXIMO_DA_FOTO) throw new Error("foto_maior_5mb");
              chunks.push(r.value);
            }
          } finally { await reader.cancel(); }
          const bytes = Buffer.concat(chunks); const tipo = farejarTipo(bytes);
          if (!tipo) throw new Error("formato_foto_invalido");
          const hash = createHash("sha256").update(bytes).digest("hex");
          const fileId = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
          const path = `${orgId}/${id}/${fileId}.${extensaoDe(tipo)}`;
          const upload = await db.storage.from(BUCKET_DAS_FOTOS).upload(path, bytes, { contentType: tipo });
          if (upload.error && !/already exists/i.test(upload.error.message) && String((upload.error as { statusCode?: string }).statusCode) !== "409") throw new Error("upload_foto_falhou");
          fotos.push(path);
        }
      }
      const { error } = await db.from("catalog_products").upsert({
        ...mapped, id, organization_id: orgId,
        ativo: p.status === "publish" && (!pai || pai.status === "publish") ? old?.ativo ?? false : false,
        descricao: old && c.preservar_conteudo ? old.descricao : mapped.descricao,
        fotos, woo_seen_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) throw new Error(error.code === "23505" ? "conflito_sku" : "gravar_produto_falhou");
      await apagarDoBucket(orgId, id, (old?.fotos ?? []).filter((path: string) => !fotos.includes(path)), randomUUID());
    };
    for (const p of produtos) {
      if (p.type === "variable") {
        // Parent is a grouping, never a sellable item with an ambiguous price.
        let page = 1;
        while (true) {
          const raw = await get(`products/${p.id}/variations?per_page=100&page=${page}`);
          const variants = z.array(produtoWooSchema).parse(raw);
          if (!variants.length) break;
          for (const v of variants) await save(v, p);
          page++;
        }
      } else if (["simple", "external"].includes(p.type)) await save(p);
    }
    const done = produtos.length === 0;
    if (done) {
      const retired = await db.from("catalog_products").update({ ativo: false, woo_disponivel: false })
        .eq("organization_id", orgId).not("woo_id", "is", null).lt("woo_seen_at", c.cycle_started_at);
      if (retired.error) throw new Error("desativacao_falhou");
    }
    await atualizar({ page: done ? 1 : c.page + 1, lease_until: null, last_error: null,
      processed: done ? c.processed : c.processed + produtos.length,
      ...(done ? { last_success_at: new Date().toISOString(), cycle_started_at: new Date().toISOString(), processed: 0 } : {}),
      next_run_at: new Date(Date.now() + (done ? 15 * 60_000 : 0)).toISOString(),
    });
    await audit({ organizationId: orgId, actorUserId: null, action: "woocommerce.synced", resourceType: "catalog_products", requestId: randomUUID() });
    return true;
  } catch (e) {
    // Persist only known, non-secret error codes; never remote bodies or credentials.
    const message = e instanceof Error && /^[a-z_0-9]+$/.test(e.message) ? e.message : "sincronizacao_falhou";
    await atualizar({ lease_until: null, last_error: message, next_run_at: new Date(Date.now() + 5 * 60_000).toISOString() });
    return false;
  }
}
