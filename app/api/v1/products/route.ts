import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/products — o catálogo da organização ativa.
 * POST /api/v1/products — cadastra um produto.
 *
 * Escrita exige `manager`: preço de venda não se altera com papel de leitura, e
 * é o motivo de este catálogo não morar na tabela da Nuvemshop, cuja policy é
 * org-flat sem checagem de papel.
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { moedaDaOrganizacao } from "@/lib/catalogo/moeda-da-org";
import { COLUNAS_DO_PRODUTO, produtoCreateSchema } from "@/lib/schemas/produtos";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;

  const pagination = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(500).default(100) }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!pagination.success) return fail("validation_failed", "Paginación inválida.", 422, { requestId });
  const { page, limit } = pagination.data;
  const busca = (req.nextUrl.searchParams.get("busca")?.trim() ?? "").replace(/[(),%]/g, "").slice(0, 200);
  const supabase = await createClient();

  let q = supabase
    .from("catalog_products")
    .select(COLUNAS_DO_PRODUTO, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  // A busca da TELA é substring simples, de propósito: quem opera a loja digita
  // o nome como cadastrou. A busca por token (que tolera "ifone") é a do
  // AGENTE, em `lib/catalogo/busca.ts`, e ela responde a outra pergunta.
  if (busca !== "") q = q.or(`nome.ilike.%${busca}%,codigo.ilike.%${busca}%,marca.ilike.%${busca}%`);

  const { data, error, count } = await q
    .order("ativo", { ascending: false })
    .order("nome").order("id")
    .range((page - 1) * limit, page * limit - 1);

  if (error) return fail("internal_error", "Erro ao listar os produtos.", 500, { requestId });
  return ok(data ?? [], { requestId, meta: { total: count, has_more: page * limit < (count ?? 0), page, limit } });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = produtoCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  // A moeda vem da organização, nunca do corpo — ver `moedaDaOrganizacao()`.
  const moeda = await moedaDaOrganizacao(supabase, authz.org.orgId);
  const { data, error } = await supabase
    .from("catalog_products")
    .insert({ ...parsed.data, moeda, organization_id: authz.org.orgId, origem: "manual" })
    .select(COLUNAS_DO_PRODUTO)
    .single();

  if (error) {
    // 23505 = já existe produto com este código nesta organização. A recusa
    // nomeia o campo porque quem lê é quem digitou.
    if (error.code === "23505") {
      return fail("conflict", t("Já existe um produto com esse código."), 409, { requestId });
    }
    return fail("internal_error", "Erro ao salvar o produto.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "catalog_product.created",
    resourceType: "catalog_products",
    resourceId: (data as unknown as { id: string }).id,
    requestId,
  });

  return ok(data, { requestId, status: 201 });
}
