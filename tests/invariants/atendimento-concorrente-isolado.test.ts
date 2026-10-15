import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { claimOfJob } from '@/lib/agent-engine/queue/claim';
import { claimJobs, completeJob, enqueueJob } from '@/lib/agent-engine/queue/queue';
import { registrarFechamentoInvalido } from '@/lib/agent-engine/agent/fechar-checkpoint';
import type { createInboundTurnHandler as Handler } from '@/lib/agent-engine/agent/inbound-turn';
import type { createFakeRegistry as Registry } from '@/lib/agent-engine/edge/llm/providers';
import type { createLogger as Logger } from '@/lib/agent-engine/obs/logger';

if (!process.env.TEST_DB_CONTAINER) throw new Error('Rode por pnpm test:db — banco efêmero, nunca produção.');
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`, max: 16 });
let handler: typeof Handler, registry: typeof Registry, logger: typeof Logger;
const uso = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const resumo = JSON.stringify({ rolling_summary: 'Atendimento sintético concluído', declaracao: { nada_a_declarar: true } });
const texto = (text: string) => ({ content: [{ type: 'text' as const, text }], finishReason: { unified: 'stop' as const, raw: undefined }, usage: uso, warnings: [] });

async function org() {
  const id = randomUUID();
  await pool.query('insert into organizations (id,slug,legal_name,display_name) values ($1::uuid,$1::text,$1::text,$1::text)', [id]);
  return id;
}
beforeAll(async () => {
  handler = (await import('@/lib/agent-engine/agent/inbound-turn')).createInboundTurnHandler;
  registry = (await import('@/lib/agent-engine/edge/llm/providers')).createFakeRegistry;
  logger = (await import('@/lib/agent-engine/obs/logger')).createLogger;
  await pool.query(`with v as (
    insert into playbook_versions (organization_id,layer,content)
    select null,'platform','Assistente de teste isolado.'
    where not exists (select 1 from playbook_pointers where organization_id is null and layer='platform') returning id
  ) insert into playbook_pointers (organization_id,layer,version_id) select null,'platform',id from v`);
});
afterAll(() => pool.end());

// Mede o motor/claim com respostas determinísticas e transporte de captura.
// Não mede latência/quotas do fornecedor de IA, capacidade do VPS ou semântica do modelo.
describe('atendimentos concorrentes sem destinatários reais', () => {
  it.each([5, 10, 20])('%i conversas: sem omissões, duplicatas ou mistura de contexto', async quantidade => {
    const orgs = [await org(), await org()];
    const fixtures = new Map<string, { org: string; contact: string; conv: string; session: string; first: string; second: string }>();
    for (let n = 0; n < quantidade; n++) {
      const organization = orgs[n % 2]!;
      const contact = randomUUID(), conv = randomUUID(), session = randomUUID();
      const first = `Consulta inicial ${contact}`, second = `Complemento ${contact}`;
      await pool.query(`insert into contacts(id,organization_id,name,phone_number) values($1,$2,'Cliente sintético',$3)`, [contact, organization, `+000${String(n).padStart(8, '0')}`]);
      await pool.query(`insert into channel_sessions(id,organization_id,provider,waha_session_name,status,webhook_secret_encrypted)
        values($1::uuid,$2,'waha',$1::text,'WORKING','\\x00'::bytea)`, [session, organization]);
      await pool.query(`insert into conversations(id,organization_id,contact_id,channel_session_id,status,is_group)
        values($1,$2,$3,$4,'open',false)`, [conv, organization, contact, session]);
      const msgs = [randomUUID(), randomUUID()];
      for (let i = 0; i < 2; i++) await pool.query(`insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_via,sent_at,created_at)
        values($1,$2,$3,$4,$5,'text','inbound','delivered',$6,'external_device',now()+($7 * interval '1 millisecond'),now()+($7 * interval '1 millisecond'))`,
        [msgs[i], organization, conv, session, contact, i === 0 ? first : second, i]);
      const sourceEventId = randomUUID();
      const entrada = { kind: 'inbound_turn' as const, leadId: contact, sourceEventId, payload: { conversation_id: conv, contact_id: contact, channel_session_id: session, inbound_message_id: msgs[1], crm_event_id: sourceEventId } };
      const { job } = await enqueueJob(pool, organization, entrada);
      expect((await enqueueJob(pool, organization, entrada)).job.id).toBe(job.id);
      fixtures.set(job.id, { org: organization, contact, conv, session, first, second });
    }
    const vistos = new Set<string>(), envios = new Map<string, number>(), ativos = new Set<string>();
    let pico = 0, reparos = 0;
    const esperas: number[] = [], inicio = performance.now();
    while (vistos.size < quantidade) {
      const lotes = await Promise.all([0, 1, 2].map(n => claimJobs(pool, { workerId: `isolado-${n}`, maxConcurrency: 8, batchSize: 8 })));
      const jobs = lotes.flat();
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(8);
      await Promise.all(jobs.map(async job => {
        const f = fixtures.get(job.id)!;
        expect(f).toBeDefined();
        expect(vistos.has(job.id)).toBe(false);
        expect(ativos.has(f.contact)).toBe(false);
        ativos.add(f.contact); pico = Math.max(pico, ativos.size);
        esperas.push(performance.now() - inicio);
        let fechamento = 0;
        const executar = handler({
          crmCfg: { supabase: {} as never }, llmCfg: { anthropicApiKey: 'fake' } as never,
          knobs: { historyLimit: 10, maxContextTokens: 4000, notesIndexMaxTokens: 500, maxSteps: 4, queuedRetryDelayMs: 1000,
            breaker: { exactFailureWarn: 2, exactFailureBlock: 5, sameToolFailureWarn: 3, sameToolFailureHalt: 8, noProgressWarn: 3, noProgressBlock: 5 } },
          log: logger(), registry: registry((async (opts: { prompt?: unknown }) => {
            const prompt = JSON.stringify(opts.prompt);
            if (prompt.includes('Feche o turno AGORA')) {
              fechamento++; reparos += fechamento === 2 ? 1 : 0;
              return texto(fechamento === 1 ? '{"declaracao":{"chave_extra":true}}' : resumo);
            }
            if (prompt.includes('tool-result')) return texto('');
            expect(prompt).toContain(f.first); expect(prompt).toContain(f.second);
            expect(prompt).toContain('Mensagens pendentes do cliente');
            for (const outra of fixtures.values()) if (outra.contact !== f.contact) expect(prompt).not.toContain(outra.contact);
            return { content: [{ type: 'tool-call' as const, toolCallId: `send-${job.id}`, toolName: 'send_message', input: JSON.stringify({ body: `Recibí tu consulta y su complemento, cliente ${f.contact.slice(0, 8)}.` }) }], finishReason: { unified: 'tool-calls' as const, raw: undefined }, usage: uso, warnings: [] };
          }) as never),
          channel: () => ({ channel: 'captura', send: async (input: { tenantId: string; leadId: string; conversationId: string }) => {
            expect(input.tenantId).toBe(f.org); expect(input.leadId).toBe(f.contact); expect(input.conversationId).toBe(f.conv);
            envios.set(job.id, (envios.get(job.id) ?? 0) + 1);
            return { kind: 'sent', idempotencyKey: job.id, messageId: randomUUID() };
          }, sessionHealth: async () => ({ healthy: true, status: 'WORKING' }), capabilities: () => ({ freeform: true, media: true, audio: true }), costPerMessage: () => ({ currency: 'BRL', cents: 0 }) }) as never,
          clock: () => new Date('2026-10-14T15:00:00Z'), sleep: async () => {},
        });
        await executar(job, pool, { workerId: job.locked_by! });
        await completeJob(pool, job.id, job.locked_by!, undefined, claimOfJob(job)!.acquired_at);
        expect(fechamento).toBe(2);
        vistos.add(job.id); ativos.delete(f.contact);
      }));
    }
    expect(vistos.size).toBe(quantidade);
    expect([...envios.values()]).toEqual(Array(quantidade).fill(1));
    expect(reparos).toBe(quantidade);
    expect(pico).toBeLessThanOrEqual(8);
    const { rows } = await pool.query('select status,count(*)::int as n from job_queue where organization_id=any($1::uuid[]) group by status', [orgs]);
    expect(rows).toEqual([{ status: 'done', n: quantidade }]);
    const checkpoints = await pool.query('select count(*)::int as n from lead_checkpoints where organization_id=any($1::uuid[])', [orgs]);
    expect(checkpoints.rows[0].n).toBe(quantidade);
    esperas.sort((a,b) => a-b);
    console.info(JSON.stringify({ bancada: 'modelo_e_canal_sinteticos', conversas: quantidade, pico, envios: envios.size, reparos, espera_p95_ms: Math.round(esperas[Math.ceil(esperas.length * .95) - 1]!), duracao_ms: Math.round(performance.now() - inicio) }));
  }, 120_000);

  it('falha de fechamento é terminal e visível só no tenant e claim corretos', async () => {
    const organization = await org(), outra = await org();
    const { job } = await enqueueJob(pool, organization, { kind: 'watchdog' });
    const [claimed] = await claimJobs(pool, { workerId: 'fechamento', maxConcurrency: 8 });
    expect(claimed?.id).toBe(job.id);
    const ids = { organizationId: organization, jobId: job.id, workerId: 'fechamento', acquiredAt: claimOfJob(claimed!)!.acquired_at };
    expect(await registrarFechamentoInvalido(pool, { ...ids, organizationId: outra })).toBe(false);
    expect(await registrarFechamentoInvalido(pool, { ...ids, workerId: 'obsoleto' })).toBe(false);
    expect(await registrarFechamentoInvalido(pool, ids)).toBe(true);
    expect(await registrarFechamentoInvalido(pool, ids)).toBe(false);
    const { rows } = await pool.query('select status,last_error from job_queue where organization_id=$1 and id=$2', [organization, job.id]);
    expect(rows[0].status).toBe('dead');
    expect(rows[0].last_error).toContain('checkpoint_invalid_after_reply');
    const alertas = await pool.query('select organization_id from agent_inbox_items where organization_id=$1 and ref_id=$2', [organization, job.id]);
    expect(alertas.rows).toEqual([{ organization_id: organization }]);
  });
});
