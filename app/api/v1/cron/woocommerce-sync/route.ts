import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { sincronizarWoo } from "@/lib/woocommerce/sincronizar";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("unauthorized", "Unauthorized", 401, { requestId });
  const { data, error } = await createAdminClient().from("woocommerce_connections").select("organization_id")
    .eq("enabled", true).lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(2);
  if (error) return fail("internal_error", "No se pudo consultar la cola.", 500, { requestId });
  let processed = 0;
  for (const row of data ?? []) if (await sincronizarWoo(row.organization_id)) processed++;
  return ok({ processed }, { requestId });
}
