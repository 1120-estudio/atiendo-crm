import { describe, expect, it } from 'vitest';
import { avaliarConsultaCatalogo, criarConsultaCatalogo, INSTRUCAO_CATALOGO } from '@/lib/agent-engine/agent/consulta-catalogo';
import { catalogoGate } from '@/lib/agent-engine/guardrails/before-send';
import { tokenizar } from '@/lib/catalogo/busca';

describe('catálogo antes da recomendação', () => {
  it.each([
    '¿Buscas consola nueva o usada?', '¿Lo quieres inalámbrico o con cable?',
    'El taladro cuesta ₡14.950 e incluye dos baterías.', 'Sí tengo una opción.',
    'Temos modelos novos e usados.', 'O preço é R$ 100.',
  ])('veta sem consulta: %s', body => {
    expect(avaliarConsultaCatalogo(body, { disponivel: true, consultou: false }))
      .toMatchObject({ pass: false, code: 'catalogo_sin_consulta' });
  });
  it.each(['¡Hola! Soy tu asistente.', 'Gracias por escribirnos.', '¿Qué tipo de herramienta buscas?'])('não força busca para %s', body => {
    expect(avaliarConsultaCatalogo(body, { disponivel: true, consultou: false })).toEqual({ pass: true });
  });
  it('não impõe ferramenta que o agente não tem', () => {
    expect(avaliarConsultaCatalogo('El precio es $20')).toEqual({ pass: true });
  });
  it('só considera consulta concluída; recusas, falhas e chamadas em voo não contam', () => {
    const c = criarConsultaCatalogo();
    c.estado.disponivel = true;
    for (const falha of [null, { error: 'falhou' }, { permitido: false }, undefined]) c.registrar(falha);
    expect(c.estado.consultou).toBe(false);
    expect(avaliarConsultaCatalogo('¿Nueva o usada?', c.estado).pass).toBe(false);
    c.registrar({ produtos: [] });
    expect(c.estado.consultou).toBe(true);
    expect(criarConsultaCatalogo().estado.consultou).toBe(false);
  });
  it('o gate usa o estado do turno, não a disponibilidade da configuração', () => {
    expect(catalogoGate.evaluate({ body: 'Cuesta $20', catalogo: { disponivel: true, consultou: false } } as never).pass).toBe(false);
    expect(catalogoGate.evaluate({ body: 'Cuesta $20', catalogo: { disponivel: true, consultou: true } } as never).pass).toBe(true);
  });
  it('mesmo depois da busca, não oferece com cabo quando só voltou sem fio', () => {
    const c = criarConsultaCatalogo(); c.estado.disponivel = true;
    c.registrar({ produtos: [{ nome: 'Taladro', descricao: 'Taladro inalámbrico. Incluye cable de carga.' }] });
    expect(avaliarConsultaCatalogo('¿Inalámbrico o con cable?', c.estado)).toMatchObject({ pass: false, code: 'catalogo_variante_no_confirmada' });
    expect(avaliarConsultaCatalogo('¿Quieres ver el taladro inalámbrico?', c.estado).pass).toBe(true);
    expect(avaliarConsultaCatalogo('El taladro es inalámbrico.', c.estado).pass).toBe(true);
    c.registrar({ produtos: [{ nome: 'Taladro con cable' }] });
    expect(avaliarConsultaCatalogo('¿Inalámbrico o con cable?', c.estado).pass).toBe(true);
  });
  it('una consola sin condición explícita no habilita nueva/usada', () => {
    const c = criarConsultaCatalogo(); c.estado.disponivel = true;
    c.registrar({ produtos: [{ nome: 'Consola portátil' }] });
    expect(avaliarConsultaCatalogo('¿Nueva o usada?', c.estado).pass).toBe(false);
  });
  it('ensina consultas separadas, retificações e não inventa variantes', () => {
    expect(INSTRUCAO_CATALOGO).toContain('procure cada uma separadamente');
    expect(INSTRUCAO_CATALOGO).toContain('pedidos substituídos');
    expect(INSTRUCAO_CATALOGO).toContain('variantes que o catálogo realmente devolveu');
    expect(tokenizar('Y herramientas').palavras).toEqual(['herramientas']);
  });
});
