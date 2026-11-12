import { beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

vi.mock('@/lib/prospecting/context', () => ({ prospectingConversationContext: vi.fn() }));
vi.mock('./playbook', () => ({ loadPlaybook: vi.fn() }));
vi.mock('./skills', () => ({ loadSkills: vi.fn() }));
vi.mock('./org-memory', () => ({ loadOrgMemory: vi.fn() }));

import { prospectingConversationContext } from '@/lib/prospecting/context';
import { loadPlaybook } from './playbook';
import { loadSkills } from './skills';
import { loadOrgMemory } from './org-memory';
import { carregarContextoResidente } from './contexto-residente';

const pool = {} as pg.Pool;
beforeEach(() => vi.resetAllMocks());

describe('carga do contexto residente', () => {
  it('inicia as leituras independentes sem esperar a campanha e preserva o prompt', async () => {
    let liberar!: (value: string) => void;
    vi.mocked(prospectingConversationContext).mockReturnValue(new Promise((resolve) => { liberar = resolve; }));
    vi.mocked(loadPlaybook).mockResolvedValue({ prompt: 'completo', versionIds: {} });
    vi.mocked(loadSkills).mockResolvedValue([]);
    vi.mocked(loadOrgMemory).mockResolvedValue({ content: 'memória', entries: [] });

    const resultado = carregarContextoResidente(pool, 'org', { conversationId: 'conversa', agentPrompt: 'instruções' });
    expect(loadSkills).toHaveBeenCalledWith(pool, 'org');
    expect(loadOrgMemory).toHaveBeenCalledWith(pool, 'org');
    expect(loadPlaybook).not.toHaveBeenCalled();
    liberar(' contexto da campanha');
    expect(await resultado).toEqual({ playbook: { prompt: 'completo', versionIds: {} }, skills: [], orgMemory: { content: 'memória', entries: [] } });
    expect(loadPlaybook).toHaveBeenCalledWith(pool, 'org', { agentLayer: 'instruções contexto da campanha' });
  });

  it('mantém a prévia sem consulta de campanha e propaga falhas', async () => {
    vi.mocked(loadPlaybook).mockResolvedValue({ prompt: 'plataforma', versionIds: {} });
    vi.mocked(loadSkills).mockRejectedValue(new Error('falha nas capacidades'));
    vi.mocked(loadOrgMemory).mockResolvedValue({ content: null, entries: [] });
    await expect(carregarContextoResidente(pool, 'org', { conversationId: null })).rejects.toThrow('falha nas capacidades');
    expect(prospectingConversationContext).not.toHaveBeenCalled();
    expect(loadPlaybook).toHaveBeenCalledWith(pool, 'org', undefined);
  });
});
