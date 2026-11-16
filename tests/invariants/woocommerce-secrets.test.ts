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

it("denies direct credential reads for JWTs from either organization", () => {
  const a = "f0700452-0000-4000-8000-000000000001";
  const b = "f0700452-0000-4000-8000-000000000002";
  sql(`insert into public.organizations (id,slug,legal_name,display_name) values
    ('${a}','woo-secrets-a','Test A','Test A'),('${b}','woo-secrets-b','Test B','Test B') on conflict (id) do nothing;
    insert into public.woocommerce_connections(organization_id,url,credentials_enc,webhook_enc) values
    ('${a}','https://a.example','test-only','test-only'),('${b}','https://b.example','test-only','test-only')
    on conflict (organization_id) do nothing;`);
  for (const org of [a,b]) {
    expect(lastLine(sql(`
      set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${org}"}',false);
      do $$ begin
        begin
          perform credentials_enc from public.woocommerce_connections where organization_id='${a}';
          raise exception 'credential_read_was_not_denied';
        exception when insufficient_privilege then null;
        end;
        begin
          perform credentials_enc from public.woocommerce_connections where organization_id='${b}';
          raise exception 'cross_org_read_was_not_denied';
        exception when insufficient_privilege then null;
        end;
      end $$;
      reset role;
      select 'blocked';
    `))).toBe("blocked");
  }
});
