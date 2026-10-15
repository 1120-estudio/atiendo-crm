import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import pg from 'pg';
import { drainTick } from '@/lib/agent-engine/edge/crm/drain';
import { createLogger } from '@/lib/agent-engine/obs/logger';

if (!process.env.TEST_DB_CONTAINER) throw new Error('Rode por pnpm test:db — banco efêmero, nunca produção.');
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`, max: 2 });
const knobs = { batchSize: 50, intervalMs: 0, idleIntervalMs: 0, debounceMs: 0, reapTimeoutMs: 300_000 };
afterAll(() => pool.end());

it.each([false, true])('entrada entregue fora de ordem não some; resposta anterior=%s', async respondeu => {
  const org = randomUUID(), contact = randomUUID(), session = randomUUID(), conv = randomUUID();
  const agent = randomUUID(), version = randomUUID(), second = randomUUID(), late = randomUUID();
  await pool.query(`insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,$1::text,$1::text)`, [org]);
  await pool.query(`insert into contacts(id,organization_id,name,phone_number) values($1,$2,'Teste isolado','+00000000000')`, [contact, org]);
  await pool.query(`insert into channel_sessions(id,organization_id,waha_session_name,status,webhook_secret_encrypted)
    values($1::uuid,$2,$1::text,'WORKING',decode('00','hex'))`, [session, org]);
  await pool.query(`insert into conversations(id,organization_id,contact_id,channel_session_id,status,is_group)
    values($1,$2,$3,$4,'open',false)`, [conv, org, contact, session]);
  await pool.query(`insert into ai_agents(id,organization_id,name,system_prompt) values($1,$2,'Teste','Teste isolado')`, [agent, org]);
  await pool.query(`insert into ai_agent_versions(id,organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status,published_at)
    values($1,$2,$3,1,'Teste isolado','openai','fake',$4,'published',now())`, [version, org, agent, session]);
  await pool.query(`update ai_agents set published_version_id=$1 where organization_id=$2 and id=$3`, [version, org, agent]);
  const insertMessage = async (id: string, direction: string, body: string, sent: string, received: string) => {
    await pool.query(`insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_via,sent_at,created_at)
      values($1,$2,$3,$4,$5,'text',$6,'delivered',$7,'external_device',$8,$9)`,
    [id, org, conv, session, contact, direction, body, sent, received]);
  };
  // A primeira consulta foi ENVIADA antes, mas só CHEGOU depois da resposta.
  const t = (seconds: number) => new Date(Date.now() - 120_000 + seconds * 1000).toISOString();
  await insertMessage(second, 'inbound', 'Y también del taladro', t(4), t(15));
  if (respondeu) await insertMessage(randomUUID(), 'outbound', 'Información del taladro', t(40), t(40));
  await insertMessage(late, 'inbound', 'Quiero información de consolas', t(0), t(62));
  const event = async (message: string) => {
    const { rows } = await pool.query<{ id: string }>(`insert into event_log(organization_id,event_type,entity_kind,entity_id,payload,status)
      values($1::uuid,'ai_agent.dispatch_requested','message',$2::uuid,jsonb_build_object('organization_id',$1::text,'conversation_id',$3::text,
      'contact_id',$4::text,'channel_session_id',$5::text,'inbound_message_id',$2::text),'pending') returning id`,
    [org, message, conv, contact, session]);
    return rows[0]!.id;
  };
  // Backlog antes da resposta: dois eventos continuam gerando só UM job.
  const oldEvent = respondeu ? null : await event(second);
  const lateEvent = await event(late);
  await drainTick(pool, knobs, createLogger());
  await drainTick(pool, knobs, createLogger());
  const { rows: jobs } = await pool.query(`select payload, source_event_id from job_queue where organization_id=$1 and contact_id=$2`, [org, contact]);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.source_event_id).toBe(lateEvent);
  expect(jobs[0]!.payload.inbound_message_id).toBe(late);
  const { rows: events } = await pool.query(`select status from event_log where organization_id=$1 and id=any($2::uuid[])`, [org, [lateEvent, ...(oldEvent ? [oldEvent] : [])]]);
  expect(events).toHaveLength(oldEvent ? 2 : 1);
  expect(events.every(e => e.status === 'done')).toBe(true);
});
