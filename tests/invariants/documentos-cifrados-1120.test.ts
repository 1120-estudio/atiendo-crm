import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("Use pnpm test:db para medir documentos no Postgres real.");
const ORG = "44700000-0000-4000-8000-000000000001";
const OTHER = "44700000-0000-4000-8000-000000000002";
const USER = "44700000-1111-4000-8000-000000000001";
const CONTACT = "44700000-2222-4000-8000-000000000001";
const KEY = "chave-sintetica-de-teste-0447-nao-producao";
const DOCUMENT = "DOC-TEST-0447";
function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container!,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    {
      input: `begin;
      insert into auth.users(id,email) values ('${USER}', 'doc-0447@invariant.test');
      insert into public.organizations(id,slug,legal_name,display_name) values
        ('${ORG}', 'doc-0447-a', 'Doc Test A', 'Doc Test A'),
        ('${OTHER}', 'doc-0447-b', 'Doc Test B', 'Doc Test B');
      insert into public.user_organizations(user_id,organization_id,role,accepted_at)
        values ('${USER}', '${ORG}', 'manager', now());
      insert into public.contacts(id,organization_id,cpf_hash,cpf_encrypted)
        values ('${CONTACT}', '${ORG}', 'hash-sintetico', public.encrypt_cpf('${DOCUMENT}', '${KEY}'));
      ${script}
      rollback;`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  ).trim();
}
const sessao = `set role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${USER}","role":"authenticated"}', true);`;
const ler = `select public.decrypt_cpf('${CONTACT}', '${KEY}');`;
const negar = `do $$ begin
  perform public.decrypt_cpf('${CONTACT}', '${KEY}');
  raise exception 'controle: acesso indevido';
exception when insufficient_privilege then null; end $$;`;

describe("documento: cifra, autorização e isolamento reais", () => {
  it("grava o par que satisfaz a constraint e só o manager recupera o texto", () => {
    expect(sql(`${sessao} ${ler}`).split("\n").at(-1)).toBe(DOCUMENT);
  });
  it("duas cifras do mesmo documento diferem e não contêm o texto", () => {
    expect(
      sql(
        `select public.encrypt_cpf('${DOCUMENT}','${KEY}') <> public.encrypt_cpf('${DOCUMENT}','${KEY}');`,
      )
        .split("\n")
        .at(-1),
    ).toBe("t");
    expect(
      sql("select encode(cpf_encrypted, 'hex') from public.contacts where id = '" + CONTACT + "';"),
    ).not.toContain(DOCUMENT);
  });
  it.each([
    "update public.user_organizations set role='agent' where user_id='" + USER + "';",
    "update public.user_organizations set revoked_at=now() where user_id='" + USER + "';",
    "update public.user_organizations set accepted_at=null where user_id='" + USER + "';",
    "update public.user_organizations set organization_id='" +
      OTHER +
      "' where user_id='" +
      USER +
      "';",
  ])("nega papel, revogação, convite ou tenant inválido: %s", (mudar) => {
    expect(() => sql(`${mudar} ${sessao} ${negar}`)).not.toThrow();
  });
  it("recusa chave errada, em vez de devolver texto plausível", () => {
    expect(() =>
      sql(
        `${sessao} select public.decrypt_cpf('${CONTACT}', 'outra-chave-sintetica-0447-nao-producao');`,
      ),
    ).toThrow();
  });
  it("a anon e service_role não foi concedida uma porta de descifrado", () => {
    expect(
      sql(`select has_function_privilege('anon','public.encrypt_cpf(text,text)','EXECUTE'),
      has_function_privilege('anon','public.decrypt_cpf(uuid,text)','EXECUTE'),
      has_function_privilege('service_role','public.decrypt_cpf(uuid,text)','EXECUTE');`)
        .split("\n")
        .at(-1),
    ).toBe("f|f|f");
  });
  it("chave curta é recusada antes da cifra", () => {
    expect(() => sql("select public.encrypt_cpf('DOC-TEST', 'curta');")).toThrow();
  });
});
