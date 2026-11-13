import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ failedTable: "crm_lead_activities" as string | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-a" } }, error: null }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "not", "order", "limit"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => ({
        data: { organization_id: "org-a", is_anonymized: false },
        error: null,
      });
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(
          state.failedTable === table
            ? { data: null, error: { code: "57014", message: "query failed" } }
            : { data: table === "orders" ? [{ id: "order-a" }] : [], error: null },
        ).then(resolve);
      return chain;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      maybeSingle: async () => ({ data: null, error: null }),
    }),
  }),
}));
vi.mock("@/lib/users/nome-do-atendente", () => ({ nomesDosAtendentes: async () => new Map() }));

import { GET } from "@/app/api/v1/contacts/[id]/crm-summary/route";

describe("resumen CRM del panel", () => {
  beforeEach(() => {
    state.failedTable = "crm_lead_activities";
  });

  it("conserva pedidos y marca solo la lectura que falló", async () => {
    const response = await GET(
      new NextRequest("https://crm.example/api/v1/contacts/contact-a/crm-summary"),
      { params: Promise.resolve({ id: "contact-a" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.orders).toEqual([{ id: "order-a" }]);
    expect(body.data.activities).toBeNull();
    expect(body.data.errors).toMatchObject({ orders: false, activities: true });
  });
});
