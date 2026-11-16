import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { conexaoSchema } from "@/lib/woocommerce/contrato";
import { buscarSeguro, jsonLimitado } from "@/lib/woocommerce/http";

export async function GET() {
  const requestId = randomUUID();
  const a = await requireRole("manager", { requestId }); if (!a.ok) return a.response;
  const { data, error } = await createAdminClient().from("woocommerce_connections")
    .select("id,url,enabled,preservar_conteudo,page,processed,last_success_at,last_error,next_run_at")
    .eq("organization_id", a.org.orgId).maybeSingle();
  return error ? fail("internal_error", "No se pudo leer la conexión.", 500, { requestId }) : ok(data, { requestId });
}
export async function POST(req: NextRequest) {
  const denied = await requireSupportWrite(); if (denied) return denied;
  const requestId = randomUUID();
  const a = await requireRole("admin", { requestId }); if (!a.ok) return a.response;
  const parsed = conexaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Revisa la URL y las claves de WooCommerce.", 422, { requestId });
  const db = createAdminClient(); const p = parsed.data;
  const current = await db.from("woocommerce_connections").select("url").eq("organization_id", a.org.orgId).maybeSingle();
  const url = p.url.replace(/\/$/, "");
  if (current.error) return fail("internal_error", "No se pudo leer la conexión.", 500, { requestId });
  if (current.data && current.data.url !== url) return fail("conflict", "Esta empresa ya tiene otra tienda vinculada. Debes revisar los productos antes de cambiarla.", 409, { requestId });
  try {
    const auth = `Basic ${Buffer.from(`${p.consumer_key}:${p.consumer_secret}`).toString("base64")}`;
    await jsonLimitado(await buscarSeguro(`${url}/wp-json/wc/v3/products?per_page=1`, auth));
    const enc = await encryptWebhookSecret(db, JSON.stringify({ consumer_key: p.consumer_key, consumer_secret: p.consumer_secret }));
    const webhookSecret = randomBytes(32).toString("hex");
    const webhookEnc = await encryptWebhookSecret(db, webhookSecret);
    if (!enc || !webhookEnc) return fail("validation_failed", "La instalación necesita habilitar el cifrado de credenciales.", 422, { requestId });
    const { data, error } = await db.from("woocommerce_connections").upsert({ organization_id: a.org.orgId, url,
      credentials_enc: enc, webhook_enc: webhookEnc, preservar_conteudo: p.preservar_conteudo, enabled: true,
      next_run_at: new Date().toISOString(),
    }, { onConflict: "organization_id" }).select("id").single();
    if (error) throw new Error("guardar");
    await audit({ organizationId: a.org.orgId, actorUserId: a.user.id, action: "woocommerce.connected", resourceType: "woocommerce_connections", requestId });
    return ok({ webhook_path: `/api/v1/webhooks/woocommerce/${data.id}`, webhook_secret: webhookSecret }, { requestId });
  } catch { return fail("validation_failed", "No se pudo conectar. Comprueba HTTPS y las claves de lectura.", 422, { requestId }); }
}
export async function PATCH(req: NextRequest) {
  const denied = await requireSupportWrite(); if (denied) return denied;
  const requestId = randomUUID();
  const a = await requireRole("admin", { requestId }); if (!a.ok) return a.response;
  const p = z.object({ enabled: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("validation_failed", "Estado inválido.", 422, { requestId });
  const { error } = await createAdminClient().from("woocommerce_connections").update({ enabled: p.data.enabled, next_run_at: new Date().toISOString() }).eq("organization_id", a.org.orgId);
  if (error) return fail("internal_error", "No se pudo cambiar la conexión.", 500, { requestId });
  await audit({ organizationId: a.org.orgId, actorUserId: a.user.id, action: "woocommerce.state_changed", resourceType: "woocommerce_connections", requestId });
  return ok({ enabled: p.data.enabled }, { requestId });
}
