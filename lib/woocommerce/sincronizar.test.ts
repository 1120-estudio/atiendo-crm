import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  status: {} as Record<string, unknown>,
  parentSku: "SF340",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: true, error: null }),
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | undefined;
      const result = () => {
        if (table === "woocommerce_connections") {
          if (update) Object.assign(state.status, update);
          return { data: { url: "https://store.example", page: 1, credentials_enc: "encrypted", preservar_conteudo: true }, error: null };
        }
        if (table === "organizations") return { data: { currency: "CRC" }, error: null };
        const rows = state.rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        return { data: rows.length === 1 ? rows[0] : null, error: rows.length > 1 ? { code: "multiple" } : null };
      };
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        update(values: Record<string, unknown>) { update = values; return query; },
        single: async () => result(),
        maybeSingle: async () => result(),
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
        async upsert(values: Record<string, unknown>) {
          const collision = state.rows.some(row => row.id !== values.id && row.organization_id === values.organization_id && (row.codigo === values.codigo || row.woo_id === values.woo_id));
          if (collision) return { error: { code: "23505" } };
          const index = state.rows.findIndex(row => row.id === values.id);
          if (index < 0) state.rows.push(values); else state.rows[index] = values;
          return { error: null };
        },
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: async () => JSON.stringify({ consumer_key: "test", consumer_secret: "test" }) }));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/catalogo/fotos-no-bucket", () => ({ apagarDoBucket: async () => undefined }));
vi.mock("./http", () => ({
  jsonLimitado: async (value: unknown) => value,
  buscarSeguro: async (url: string) => {
    if (url.includes("settings/general")) return [{ id: "woocommerce_currency", value: "CRC" }];
    if (url.includes("/variations?")) return new URL(url).searchParams.get("page") === "1"
      ? [3658, 3657].map(id => ({ id, sku: state.parentSku, price: "100", images: [] })) : [];
    return [{ id: 3656, type: "variable", name: "Cámara", sku: state.parentSku, price: "100", images: [] }];
  },
}));

import { sincronizarWoo } from "./sincronizar";

describe("WooCommerce inherited variation SKUs", () => {
  beforeEach(() => { state.rows = []; state.status = {}; state.parentSku = "SF340"; });

  it("recovers a partial import, keeps another tenant untouched and is idempotent", async () => {
    state.rows.push(
      { id: "existing-blue", organization_id: "dommus", codigo: "SF340", woo_id: 3658, ativo: false, descricao: "Revisada", fotos: [] },
      { id: "other-tenant", organization_id: "multitiendas", codigo: "SF340-V3657", woo_id: 3657, ativo: true, descricao: "Otra empresa", fotos: [] },
    );
    const other = { ...state.rows[1] };
    expect(await sincronizarWoo("dommus")).toBe(true);
    expect(await sincronizarWoo("dommus")).toBe(true);
    const imported = state.rows.filter(row => row.organization_id === "dommus");
    expect(imported).toHaveLength(2);
    expect(imported.map(row => row.codigo).sort()).toEqual(["SF340-V3657", "SF340-V3658"]);
    expect(imported.find(row => row.woo_id === 3658)).toMatchObject({ id: "existing-blue", descricao: "Revisada", ativo: false });
    expect(imported.every(row => row.ativo === false)).toBe(true);
    expect(state.rows.find(row => row.id === "other-tenant")).toEqual(other);
    expect(state.status.last_error).toBeNull();
  });

  it("does not link sibling variations to an existing manual parent SKU", async () => {
    const manual = { id: "manual-parent", organization_id: "dommus", codigo: "SF340", woo_id: null, ativo: true, descricao: "Manual", fotos: [] };
    state.rows.push({ ...manual });
    expect(await sincronizarWoo("dommus")).toBe(true);
    expect(state.rows).toHaveLength(3);
    expect(state.rows.find(row => row.id === manual.id)).toEqual(manual);
    expect(state.rows.filter(row => row.woo_id != null).map(row => row.codigo).sort()).toEqual(["SF340-V3657", "SF340-V3658"]);
  });
});
