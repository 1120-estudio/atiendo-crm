import { describe, expect, it, vi } from 'vitest';
import { CheckpointInvalidoError, fecharCheckpoint } from '@/lib/agent-engine/agent/fechar-checkpoint';
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
});
