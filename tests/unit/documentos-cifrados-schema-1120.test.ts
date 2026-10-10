import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(
  "supabase/migrations/20261010210000_0447_documentos_personales_cifrados.sql",
  "utf8",
);
const baseline = readFileSync("supabase/baseline.sql", "utf8");
describe("contrato SQL de documentos", () => {
  it("baseline e migration aplicam o mesmo contrato antes da varredura", () => {
    expect(baseline).toContain(migration.trim());
    expect(baseline.indexOf(migration.trim())).toBeLessThan(
      baseline.indexOf("-- ---- VARREDURA anon:"),
    );
  });
  it("a função de decifra vincula sessão, tenant e papel antes de ler o texto", () => {
    const start = migration.indexOf("create or replace function public.decrypt_cpf(");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = migration.slice(start, migration.indexOf("$$;", start));
    for (const condition of [
      "u.organization_id = c.organization_id",
      "u.user_id = auth.uid()",
      "u.revoked_at is null",
      "u.accepted_at is not null",
      "u.role in ('manager', 'admin')",
      "if not found then",
      "length(p_key) < 32",
    ]) {
      expect(body).toContain(condition);
      expect(body.indexOf(condition)).toBeLessThan(body.indexOf("return pgp_sym_decrypt("));
    }
    expect(body).toContain("set search_path = public, extensions, pg_temp");
  });
  it("a ACL remove defaults e concede decifra apenas à sessão autenticada", () => {
    expect(migration).toContain(
      "revoke all on function public.decrypt_cpf(uuid, text) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.decrypt_cpf(uuid, text) to authenticated;",
    );
    expect(migration).not.toMatch(/grant\s+.*decrypt_cpf[^;]+to\s+(?:public|anon|service_role)/i);
  });
});
