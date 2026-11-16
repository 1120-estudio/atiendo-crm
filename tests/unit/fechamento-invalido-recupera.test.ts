import { describe, expect, it, vi } from 'vitest';
import { CheckpointInvalidoError, fecharCheckpoint, formatarDiagnosticoCheckpoint, registrarFechamentoInvalido } from '@/lib/agent-engine/agent/fechar-checkpoint';
import { parseCheckpointText } from '@/lib/agent-engine/agent/inbound-turn';

const valido = JSON.stringify({ rolling_summary: 'Pedido confirmado', declaracao: { intencoes: [], promessas: [], nada_a_declarar: true } });
const invalido = JSON.stringify({ declaracao: { campo_inventado: true } });

describe('recuperação só do fechamento', () => {
  it('corrige formato sem repetir ferramentas ou enviar outra mensagem', async () => {
    const chamar = vi.fn().mockResolvedValueOnce(invalido).mockResolvedValueOnce(valido);
    const corrigir = vi.fn();
    const enviar = vi.fn();
    // O atendimento aconteceu antes da fronteira de fechamento.
    enviar();
    const r = await fecharCheckpoint({ chamar, validar: parseCheckpointText, aoCorrigir: corrigir });
    expect(r.content.rolling_summary).toBe('Pedido confirmado');
    expect(chamar.mock.calls).toEqual([[false], [true]]);
    expect(corrigir).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it('formato válido não gasta uma chamada extra', async () => {
    const chamar = vi.fn().mockResolvedValue(valido);
    await fecharCheckpoint({ chamar, validar: parseCheckpointText, aoCorrigir: vi.fn() });
    expect(chamar).toHaveBeenCalledTimes(1);
  });
  it('limita a recuperação a uma chamada e preserva o erro estrito', async () => {
    const chamar = vi.fn().mockResolvedValue(invalido);
    await expect(fecharCheckpoint({ chamar, validar: parseCheckpointText, aoCorrigir: vi.fn() }))
      .rejects.toBeInstanceOf(CheckpointInvalidoError);
    expect(chamar).toHaveBeenCalledTimes(2);
    expect(() => parseCheckpointText(invalido)).toThrow(/unrecognized_keys/);
  });
  it('não trata falha de transporte como JSON inválido', async () => {
    const chamar = vi.fn().mockRejectedValue(new Error('transport_error'));
    await expect(fecharCheckpoint({ chamar, validar: parseCheckpointText, aoCorrigir: vi.fn() })).rejects.toThrow('transport_error');
    expect(chamar).toHaveBeenCalledTimes(1);
  });
  it('não expõe o texto do cliente no erro de validação', () => {
    expect(() => parseCheckpointText('{"declaracao":{"dado_pessoal":"cliente privado"}}')).toThrow(CheckpointInvalidoError);
    try { parseCheckpointText('{"declaracao":{"dado_pessoal":"cliente privado"}}'); }
    catch (error) { expect(String(error)).not.toContain('cliente privado'); }
  });
  it('entrega ao reparo somente diagnóstico seguro sobre o campo inválido', async () => {
    const chamar = vi.fn().mockResolvedValueOnce('{"declaracao":{"segredo_do_cliente":"conteúdo privado"}}').mockResolvedValueOnce(valido);
    const corrigir = vi.fn();
    await fecharCheckpoint({ chamar, validar: parseCheckpointText, aoCorrigir: corrigir });
    const error = corrigir.mock.calls[0]![0] as CheckpointInvalidoError;
    expect(formatarDiagnosticoCheckpoint(error.diagnostico)).toBe('estrutura_invalida:declaracao:unrecognized_keys');
    expect(JSON.stringify(error.diagnostico)).not.toMatch(/segredo_do_cliente|conteúdo privado/);
  });
  it('distingue ausência de JSON e JSON malformado sem guardar a resposta', () => {
    for (const [text, expected] of [['conteúdo privado', 'sem_json:raiz:outro'], ['{"x":}', 'json_invalido:raiz:outro']]) {
      try { parseCheckpointText(text!); throw new Error('deveria rejeitar'); }
      catch (error) {
        expect(error).toBeInstanceOf(CheckpointInvalidoError);
        expect(formatarDiagnosticoCheckpoint((error as CheckpointInvalidoError).diagnostico)).toBe(expected);
        expect(String(error)).not.toContain('conteúdo privado');
      }
    }
  });
  it('registra somente os códigos seguros e mantém a operação condicionada ao claim', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'job' }] });
    const db = { query };
    await registrarFechamentoInvalido(db as never, { organizationId: 'org', jobId: 'job', workerId: 'worker', acquiredAt: '2026-11-09T00:00:00Z', diagnostico: { tipo: 'estrutura_invalida', campo: 'declaracao', codigo: 'invalid_type' } });
    expect(query.mock.calls[0]![0]).toContain('locked_by=$3 and locked_at=$4');
    expect(query.mock.calls[0]![1][4]).toContain('estrutura_invalida:declaracao:invalid_type');
    const unsafe = { tipo: 'cliente privado', campo: 'nome', codigo: 'conteudo' } as never;
    expect(formatarDiagnosticoCheckpoint(unsafe)).toBe('desconhecido:raiz:outro');
  });

});
