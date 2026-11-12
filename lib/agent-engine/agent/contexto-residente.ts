import type pg from 'pg';
import { prospectingConversationContext } from '@/lib/prospecting/context';
import { loadPlaybook } from './playbook';
import { loadSkills } from './skills';
import { loadOrgMemory } from './org-memory';

/** Leituras independentes em paralelo, sempre resolvidas novamente a cada turno. */
export async function carregarContextoResidente(
  pool: pg.Pool,
  tenantId: string,
  options: { conversationId: string | null; agentPrompt?: string },
) {
  const [playbook, skills, orgMemory] = await Promise.all([
    (async () => {
      const contexto = options.conversationId
        ? await prospectingConversationContext(pool, tenantId, options.conversationId)
        : '';
      return loadPlaybook(pool, tenantId, options.agentPrompt !== undefined
        ? { agentLayer: options.agentPrompt + contexto }
        : undefined);
    })(),
    loadSkills(pool, tenantId),
    loadOrgMemory(pool, tenantId),
  ]);
  return { playbook, skills, orgMemory };
}
