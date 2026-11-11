import { beforeAll, describe, expect, it } from "vitest";
import { GOV_AGENT_A, GOV_AGENT_B, GOV_MANAGER, GOV_ORG, GOV_PIPELINE, GOV_STAGE, countAs, lastLine, seedGov, sql } from "./gov-helpers";

const A = "b4491111-0000-4000-8000-000000000001";
const B = "b4491111-0000-4000-8000-000000000002";
const ACT_A = "b4492222-0000-4000-8000-000000000001";
const ACT_B = "b4492222-0000-4000-8000-000000000002";
const OUTSIDER = "b4493333-0000-4000-8000-000000000001";

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id,email) values ('${OUTSIDER}', 'b449-outsider@invariant.test') on conflict do nothing;
    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title, owner_user_id) values
      ('${A}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', 'Synthetic A', '${GOV_AGENT_A}'),
      ('${B}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', 'Synthetic B', '${GOV_AGENT_B}') on conflict do nothing;
    insert into public.crm_lead_activities (id,organization_id,lead_id,source_module,type) values
      ('${ACT_A}','${GOV_ORG}','${A}','invariant','note'),
      ('${ACT_B}','${GOV_ORG}','${B}','invariant','note') on conflict do nothing;
  `);
});

describe("a otimização preserva a visibilidade original", () => {
  for (const user of [GOV_AGENT_A, GOV_AGENT_B, GOV_MANAGER, OUTSIDER]) {
    it(`conversas seguem fn_can_view_conversation para ${user}`, () => {
      const actual = countAs(user, `select count(*) from conversations where organization_id='${GOV_ORG}'`);
      const expected = Number(lastLine(sql(`select set_config('request.jwt.claims','{"sub":"${user}"}',false); select count(*) from conversations where organization_id='${GOV_ORG}' and fn_can_view_conversation(organization_id,assigned_to_user_id);`)));
      expect(actual).toBe(expected);
    });
    it(`leads e atividades seguem fn_can_view_lead para ${user}`, () => {
      const expected = Number(lastLine(sql(`select set_config('request.jwt.claims','{"sub":"${user}"}',false); select count(*) from crm_leads where id in ('${A}','${B}') and fn_can_view_lead(organization_id,owner_user_id);`)));
      expect(countAs(user, `select count(*) from crm_leads where id in ('${A}','${B}')`)).toBe(expected);
      expect(countAs(user, `select count(*) from crm_lead_activities where id in ('${ACT_A}','${ACT_B}')`)).toBe(expected);
    });
  }
  it("mantém o caso negativo: agente não vê o lead de outro", () => {
    expect(countAs(GOV_AGENT_A, `select count(*) from crm_lead_activities where id='${ACT_B}'`)).toBe(0);
    expect(countAs(GOV_MANAGER, `select count(*) from crm_lead_activities where id in ('${ACT_A}','${ACT_B}')`)).toBe(2);
    expect(countAs(OUTSIDER, `select count(*) from crm_lead_activities where id in ('${ACT_A}','${ACT_B}')`)).toBe(0);
  });
});
