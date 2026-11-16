import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { timingSafeStringEqual } from "@/lib/auth/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { ok, fail } from "@/lib/api/wrappers";
/** WooCommerce notifications only advance reconciliation; never trust their product payload. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const requestId = randomUUID(); const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) return fail("unauthorized", "Invalid webhook", 401, { requestId });
  const db = createAdminClient();
  const { data } = await db.from("woocommerce_connections").select("organization_id,webhook_enc").eq("id", token).eq("enabled", true).maybeSingle();
  if (!data) return fail("unauthorized", "Invalid webhook", 401, { requestId });
  const reader = req.body?.getReader(); if (!reader) return fail("validation_failed", "Empty body", 422, { requestId });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const r = await reader.read(); if (r.done) break; size += r.value.length;
      if (size > 1024 * 1024) return fail("payload_too_large", "Body too large", 413, { requestId }); chunks.push(r.value); }
  } finally { await reader.cancel(); }
  const secret = await decryptWebhookSecret(db, data.webhook_enc);
  const signature = req.headers.get("x-wc-webhook-signature") ?? "";
  if (!secret || !timingSafeStringEqual(signature, createHmac("sha256", secret).update(Buffer.concat(chunks)).digest("base64")))
    return fail("unauthorized", "Invalid signature", 401, { requestId });
  const { error } = await db.from("woocommerce_connections").update({ next_run_at: new Date().toISOString() }).eq("organization_id", data.organization_id);
  return error ? fail("internal_error", "Queue unavailable", 500, { requestId }) : ok({ accepted: true }, { requestId });
}
