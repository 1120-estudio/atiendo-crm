import { describe, expect, it } from "vitest";
import { lastLine, sql } from "./gov-helpers";
describe("WooCommerce credentials stay server-only", () => {
  it("does not grant credentials or queue leases to browser roles", () => {
    expect(lastLine(sql(`select count(*) from information_schema.role_table_grants
      where table_schema='public' and table_name='woocommerce_connections'
      and grantee in ('anon','authenticated','PUBLIC');`))).toBe("0");
    expect(lastLine(sql(`select has_function_privilege('authenticated','public.fn_claim_woocommerce(uuid,timestamptz)','EXECUTE')::text;`))).toBe("false");
    expect(lastLine(sql(`select has_function_privilege('anon','public.fn_claim_woocommerce(uuid,timestamptz)','EXECUTE')::text;`))).toBe("false");
  });
  it("requires organization scoping for external product identity", () => {
    expect(lastLine(sql(`select count(*) from pg_indexes where schemaname='public'
      and tablename='catalog_products' and indexname='catalog_products_woo_identity'
      and indexdef like '%organization_id, woo_id%';`))).toBe("1");
  });
});
