import { describe, expect, it } from 'vitest';
import { buildOpeningMessage } from '@/lib/agent-engine/agent/inbound-turn';
import type { LeadContext } from '@/lib/agent-engine/edge/crm/get-lead-context';

const CONSOLAS = 'Consolas de videojuegos';
const HERRAMIENTAS = 'Y herramientas';
const TITULO = '## Mensagens pendentes do cliente — pedido completo deste turno';
function contexto(messages: Array<['inbound' | 'outbound', string]>): LeadContext {
  return {
    lead_id: '11111111-1111-4111-8111-111111111111',
    conversation_id: '22222222-2222-4222-8222-222222222222',
    contact: { name: 'Santiago', phone: null, email: null, tags: [], is_blocked: false },
    last_human_decision: null,
    messages: messages.map(([direction, body], i) => ({ direction, body, sent_at: `2026-10-14T19:17:${String(i).padStart(2, '0')}-05:00` })),
  };
}
function abrir(messages: Array<['inbound' | 'outbound', string]>, pin?: string) {
  return buildOpeningMessage(null, null, contexto(messages), 'sem notas', false, [], '', pin);
}
function pendentes(abertura: string): string[] | null {
  const bloco = abertura.split(TITULO)[1];
  if (!bloco) return null;
  const linha = bloco.split('\n').find(l => l.startsWith('{"mensagens":'));
  return linha ? (JSON.parse(linha) as { mensagens: string[] }).mensagens : null;
}

describe('o pedido completo da rajada, não só a mensagem que dispara o job', () => {
  it.each([CONSOLAS, HERRAMIENTAS, undefined])('entrega as duas consultas em ordem com pin %s', pin => {
    const abertura = abrir([['outbound', '¿Qué buscas?'], ['inbound', CONSOLAS], ['inbound', HERRAMIENTAS]], pin);
    expect(pendentes(abertura)).toEqual([CONSOLAS, HERRAMIENTAS]);
    expect(abertura).not.toContain('Responda a ESTA mensagem agora.');
    expect(abertura).toContain('Atenda a TODOS os pedidos ainda vigentes');
  });

  it('não volta a promover como pendente o pedido já respondido', () => {
    const abertura = abrir([
      ['inbound', 'Juguetes'], ['outbound', 'No aparecen juguetes.'],
      ['inbound', CONSOLAS], ['inbound', HERRAMIENTAS],
    ], HERRAMIENTAS);
    expect(pendentes(abertura)).toEqual([CONSOLAS, HERRAMIENTAS]);
  });

  it('mantém a mensagem canônica quando um histórico concorrente não a contém', () => {
    const abertura = abrir([['inbound', CONSOLAS], ['inbound', HERRAMIENTAS]], 'Quiero agendar una cita');
    expect(pendentes(abertura)).toBeNull();
    expect(abertura).toContain(JSON.stringify({ texto: 'Quiero agendar una cita' }));
  });

  it('preserva a prioridade de uma mensagem isolada sobre memória antiga', () => {
    const abertura = abrir([['outbound', 'Hola'], ['inbound', CONSOLAS]], CONSOLAS);
    expect(pendentes(abertura)).toBeNull();
    expect(abertura).toContain('Responda a ESTA mensagem agora.');
  });

  it('conserva complementos e correções como mensagens separadas, sem reinterpretar o texto', () => {
    const correcao = 'No, mejor solo consolas';
    const abertura = abrir([['inbound', CONSOLAS], ['inbound', HERRAMIENTAS], ['inbound', correcao]], correcao);
    expect(pendentes(abertura)).toEqual([CONSOLAS, HERRAMIENTAS, correcao]);
    expect(abertura).toContain('respeite a correção mais recente');
  });
});
