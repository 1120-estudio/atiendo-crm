import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { anotarUltimaInboundVista, ultimaInboundJaRespondida } from '@/lib/agent-engine/agent/turno-ja-respondido';

if (!process.env.TEST_DB_CONTAINER) throw new Error('Rode via pnpm test:db');
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres` });
const org = 'ddd20000-0000-4000-8000-000000000001';
const contact = 'ddd20000-0000-4000-8000-000000000002';
const session = 'ddd20000-0000-4000-8000-000000000003';
const conversation = 'ddd20000-0000-4000-8000-000000000004';
const antes = '2026-10-14T22:38:04.171953Z';
const resposta = '2026-10-14T22:38:24.577873Z';
const depois = '2026-10-14T22:38:39.744967Z';
const alvo = (jobId: string) => ({ organizationId: org, contactId: contact, conversationId: conversation, jobId });

beforeAll(async () => {
  await pool.query(`insert into organizations (id, slug, legal_name, display_name)
    values ($1,'turno-retry','Turno retry','Turno retry')`, [org]);
  await pool.query(`insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
    values ($1,$2,'turno-retry','WORKING','\\x00'::bytea)`, [session, org]);
  await pool.query(`insert into contacts (id, organization_id, name, phone_number)
    values ($1,$2,'Contato teste','+5511900000998')`, [contact, org]);
  await pool.query(`insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
    values ($1,$2,$3,$4,'ai_handling',false)`, [conversation, org, contact, session]);
});
beforeEach(async () => {
  await pool.query('delete from send_ledger where organization_id=$1', [org]);
  await pool.query('delete from messages where organization_id=$1', [org]);
  await pool.query('delete from job_queue where organization_id=$1', [org]);
});
afterAll(async () => { await pool.end(); });

async function message(direction: 'inbound' | 'outbound', em: string) {
  const id = crypto.randomUUID();
  await pool.query(`insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
    type, direction, status, body, sent_via, sent_at, created_at)
    values ($1,$2,$3,$4,$5,'text',$6,'delivered','teste',$7,$8,$8)`,
  [id, org, conversation, session, contact, direction, direction === 'inbound' ? 'external_device' : 'ai', em]);
  return id;
}
async function job() {
  const id = crypto.randomUUID();
  await pool.query(`insert into job_queue (id, organization_id, contact_id, kind, payload, status, attempts)
    values ($1,$2,$3,'inbound_turn',$4,'done',1)`, [id, org, contact, { conversation_id: conversation, held_run_after: 'preservar' }]);
  return id;
}
async function send(id: string, status: string) {
  const msg = await message('outbound', resposta);
  await pool.query(`insert into send_ledger (organization_id, contact_id, job_id, seq, body_hash, status, crm_message_id)
    values ($1,$2,$3,1,'hash',$4,$5)`, [org, contact, id, status, msg]);
}
async function saw(id: string, em: string) {
  const { rows } = await pool.query(`select (payload->>'ultima_inbound_vista_em')::timestamptz=$3::timestamptz as ok,
    payload->>'held_run_after' as held from job_queue where organization_id=$1 and id=$2`, [org, id, em]);
  expect(rows[0]).toEqual({ ok: true, held: 'preservar' });
}

describe('checkpoint retentado depois de enviar não responde a uma inbound futura', () => {
  it.each(['accepted', 'queued'])('preserva a leitura original após envio %s e deixa o próximo turno responder', async (status) => {
    await message('inbound', antes);
    const id = await job();
    await anotarUltimaInboundVista(pool, alvo(id));
    await send(id, status);
    // Ainda barra duplicação da pergunta original.
    expect(await ultimaInboundJaRespondida(pool, alvo(crypto.randomUUID()))).toBe(true);
    await message('inbound', depois);
    await anotarUltimaInboundVista(pool, alvo(id));
    await saw(id, antes);
    expect(await ultimaInboundJaRespondida(pool, alvo(crypto.randomUUID()))).toBe(false);
  });

  it.each([null, 'failed', 'vetoed'])('sem envio aceito (%s), o retry pode atualizar o contexto', async (status) => {
    await message('inbound', antes);
    const id = await job();
    await anotarUltimaInboundVista(pool, alvo(id));
    if (status) await send(id, status);
    await message('inbound', depois);
    await anotarUltimaInboundVista(pool, alvo(id));
    await saw(id, depois);
    expect(await ultimaInboundJaRespondida(pool, alvo(crypto.randomUUID()))).toBe(false);
  });

  it('job legado com anotação corrompida não cala mensagem posterior à resposta', async () => {
    await message('inbound', antes);
    const id = await job();
    await send(id, 'accepted');
    await message('inbound', depois);
    await pool.query(`update job_queue set payload=payload || jsonb_build_object('ultima_inbound_vista_em',$3::text)
      where organization_id=$1 and id=$2`, [org, id, depois]);
    expect(await ultimaInboundJaRespondida(pool, alvo(crypto.randomUUID()))).toBe(false);
  });

  it('resposta enviada depois da inbound mas sem lê-la não a cala', async () => {
    await message('inbound', antes);
    const id = await job();
    await anotarUltimaInboundVista(pool, alvo(id));
    await message('inbound', '2026-10-14T22:38:20Z');
    await send(id, 'accepted');
    expect(await ultimaInboundJaRespondida(pool, alvo(crypto.randomUUID()))).toBe(false);
  });

  it('outra organização não pode alterar a anotação nem aproveitar a resposta', async () => {
    await message('inbound', antes);
    const id = await job();
    await anotarUltimaInboundVista(pool, alvo(id));
    await send(id, 'accepted');
    await message('inbound', depois);
    const outroTenant = { ...alvo(id), organizationId: crypto.randomUUID() };
    await anotarUltimaInboundVista(pool, outroTenant);
    await saw(id, antes);
    expect(await ultimaInboundJaRespondida(pool, outroTenant)).toBe(false);
  });
});
