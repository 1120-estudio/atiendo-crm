import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import pg from 'pg';
import { prepararFotosDoProduto } from '@/lib/agent-engine/agent/fotos-do-produto';

if (!process.env.TEST_DB_CONTAINER) throw new Error('Rode por pnpm test:db — banco efêmero, nunca produção.');
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`, max: 2 });
afterAll(() => pool.end());

async function fixture() {
  const org = randomUUID(), contact = randomUUID(), session = randomUUID(), conv = randomUUID(), product = randomUUID();
  await pool.query('insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,$1::text,$1::text)', [org]);
  await pool.query("insert into contacts(id,organization_id,name,phone_number) values($1,$2,'Teste isolado','+00000000000')", [contact, org]);
  await pool.query(`insert into channel_sessions(id,organization_id,waha_session_name,status,webhook_secret_encrypted)
    values($1::uuid,$2,$1::text,'WORKING',decode('00','hex'))`, [session, org]);
  await pool.query(`insert into conversations(id,organization_id,contact_id,channel_session_id,status,is_group,service_started_at)
    values($1,$2,$3,$4,'open',false,now()-interval '1 hour')`, [conv, org, contact, session]);
  const photo = `${org}/${product}/${randomUUID()}.jpg`;
  await pool.query(`insert into catalog_products(id,organization_id,codigo,nome,preco_cents,fotos)
    values($1,$2,'TEST','Teste isolado',100,$3::text[])`, [product, org, [photo]]);
  const path = `${org}/${conv}/catalogo-${photo.split('/').pop()}`;
  return { org, conv, contact, session, path };
}

it('foto aceita não se repete; falha, novo atendimento e pedido explícito permitem envio', async () => {
  const f = await fixture(), other = await fixture();
  const copiar = vi.fn(async () => true);
  const input = { tenantId: f.org, conversationId: f.conv, codigo: 'TEST' };
  const { rows } = await pool.query(`insert into messages(organization_id,conversation_id,contact_id,channel_session_id,
    type,direction,status,sent_via,media_storage_path,sent_at)
    values($1,$2,$3,$4,'image','outbound','failed','ai',$5,now()) returning id`,
  [f.org, f.conv, f.contact, f.session, f.path]);
  const message = rows[0]!.id;
  expect((await prepararFotosDoProduto(pool, copiar, input)).ok).toBe(true);
  expect(copiar).toHaveBeenCalledTimes(1); // falhou: não impedir uma nova tentativa.
  await pool.query("update messages set status='sent' where organization_id=$1 and id=$2", [f.org, message]);
  copiar.mockClear();
  expect(await prepararFotosDoProduto(pool, copiar, input)).toEqual({ ok: true, fotos: [], tinha: 0, jaEnviadas: 1 });
  expect(copiar).not.toHaveBeenCalled();

  const reenvio = await prepararFotosDoProduto(pool, copiar, { ...input, reenviar: true });
  expect(reenvio.ok && reenvio.fotos).toHaveLength(1);
  const pedidoDireto = await prepararFotosDoProduto(pool, copiar, {
    ...input, pedidoCliente: 'Sí, envíame la foto otra vez',
  });
  expect(pedidoDireto.ok && pedidoDireto.fotos).toHaveLength(1);
  // Mesmo código noutra organização e outra conversa não herda a supressão.
  const alheio = await prepararFotosDoProduto(pool, copiar, {
    tenantId: other.org, conversationId: other.conv, codigo: 'TEST',
  });
  expect(alheio.ok && alheio.fotos).toHaveLength(1);
  expect(alheio.ok && alheio.fotos[0]!.storagePath).toBe(other.path);
  // Dentro da mesma organização, outra conversa também é independente.
  const newConv = randomUUID(), newSession = randomUUID();
  await pool.query(`insert into channel_sessions(id,organization_id,waha_session_name,status,webhook_secret_encrypted)
    values($1::uuid,$2,$1::text,'WORKING',decode('00','hex'))`, [newSession, f.org]);
  await pool.query(`insert into conversations(id,organization_id,contact_id,channel_session_id,status,is_group)
    values($1,$2,$3,$4,'open',false)`, [newConv, f.org, f.contact, newSession]);
  const outra = await prepararFotosDoProduto(pool, copiar, { ...input, conversationId: newConv });
  expect(outra.ok && outra.fotos).toHaveLength(1);

  await pool.query('update conversations set service_started_at=clock_timestamp() where organization_id=$1 and id=$2', [f.org, f.conv]);
  const novo = await prepararFotosDoProduto(pool, copiar, input);
  expect(novo.ok && novo.fotos).toHaveLength(1);
});

it.each(['accepted', 'queued'])('recibo %s evita repetir foto ainda não atualizada em messages', async status => {
  const f = await fixture(), job = randomUUID();
  await pool.query(`insert into job_queue(id,organization_id,contact_id,kind,payload,status)
    values($1,$2,$3,'inbound_turn',$4,'done')`, [job, f.org, f.contact, { conversation_id: f.conv }]);
  const { rows } = await pool.query(`insert into messages(organization_id,conversation_id,contact_id,channel_session_id,
    type,direction,status,sent_via,media_storage_path,sent_at)
    values($1,$2,$3,$4,'image','outbound','queued','ai',$5,now()) returning id`,
  [f.org, f.conv, f.contact, f.session, f.path]);
  await pool.query(`insert into send_ledger(organization_id,contact_id,job_id,seq,body_hash,status,crm_message_id)
    values($1,$2,$3,1,'teste-isolado',$4,$5)`, [f.org, f.contact, job, status, rows[0]!.id]);
  const copiar = vi.fn(async () => true);
  const r = await prepararFotosDoProduto(pool, copiar, {
    tenantId: f.org, conversationId: f.conv, codigo: 'TEST',
  });
  expect(r).toEqual({ ok: true, fotos: [], tinha: 0, jaEnviadas: 1 });
  expect(copiar).not.toHaveBeenCalled();
  // Retentar O MESMO job não pode deslocar a sequência de envio/idempotência.
  const replay = await prepararFotosDoProduto(pool, copiar, {
    tenantId: f.org, conversationId: f.conv, codigo: 'TEST', jobId: job,
  });
  expect(replay.ok && replay.fotos).toHaveLength(1);
});

