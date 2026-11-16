import { describe, expect, it } from 'vitest';
import { sentimentPrompt } from './sentiment-context';

describe('contexto para clasificar el último mensaje', () => {
  it('mantiene la secuencia y distingue al cliente del equipo sin duplicar el mensaje actual', () => {
    const prompt = JSON.parse(sentimentPrompt('Le aviso', '3', [
      { id: '3', direction: 'inbound', body: 'Le aviso' },
      { id: '2', direction: 'outbound', body: 'Cuesta ₡10.000' },
      { id: '1', direction: 'inbound', body: '¿Cuánto cuesta?' },
    ]));
    expect(prompt).toEqual({ historial: [
      { role: 'cliente', text: '¿Cuánto cuesta?' },
      { role: 'equipo', text: 'Cuesta ₡10.000' },
    ], mensaje_actual_del_cliente: 'Le aviso' });
  });

  it('acota el historial y excluye mensajes sin texto', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ id: String(i), direction: 'inbound', body: 'x'.repeat(700) }));
    history.unshift({ id: 'empty', direction: 'inbound', body: '' });
    const prompt = JSON.parse(sentimentPrompt('a'.repeat(3000), 'actual', history));
    expect(prompt.historial).toHaveLength(6);
    expect(prompt.historial[0].text).toHaveLength(500);
    expect(prompt.mensaje_actual_del_cliente).toHaveLength(2000);
  });
});
