import { beforeAll, describe, expect, it } from "vitest";
import { GOV_ADMIN, GOV_AGENT_A, GOV_AGENT_B, GOV_MANAGER, GOV_ORG, GOV_VIEWER, lastLine, seedGov, sql } from "./gov-helpers";

const OUTSIDER = "eeeeaaaa-1111-4000-8000-000000000001";
const usuarios = [GOV_AGENT_A, GOV_AGENT_B, GOV_MANAGER, GOV_VIEWER, GOV_ADMIN, OUTSIDER];
const claims = (user: string) => `select set_config('request.jwt.claims','{"sub":"${user}"}',false);`;

beforeAll(() => {
  seedGov();
  sql(`insert into auth.users (id,email) values ('${OUTSIDER}', 'inbox-outsider@invariant.test') on conflict do nothing;`);
});

describe("alcance do inbox conserva a regra anterior", () => {
  for (const modo of ["own", "own_and_unassigned", "all", "valor_desconhecido"]) {
    it(`mantém exatamente as conversas autorizadas em ${modo}`, () => {
      sql(`update public.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{visibility_mode}',to_jsonb('${modo}'::text)) where id='${GOV_ORG}';`);
      for (const user of usuarios) {
        const esperado = lastLine(sql(`${claims(user)} select coalesce(array_agg(id order by id)::text,'{}') from public.conversations where organization_id='${GOV_ORG}' and public.fn_can_view_conversation(organization_id,assigned_to_user_id);`));
        const real = lastLine(sql(`set role authenticated; ${claims(user)} select coalesce(array_agg(id order by id)::text,'{}') from public.conversations where organization_id='${GOV_ORG}';`));
        expect(real, `${modo}: ${user}`).toBe(esperado);
      }
    });
  }
  it("remove o acesso quando a participação é revogada", () => {
    sql(`update public.user_organizations set revoked_at=now() where organization_id='${GOV_ORG}' and user_id='${GOV_AGENT_A}';`);
    const real = lastLine(sql(`set role authenticated; ${claims(GOV_AGENT_A)} select count(*) from public.conversations where organization_id='${GOV_ORG}';`));
    expect(real).toBe("0");
  });
});
