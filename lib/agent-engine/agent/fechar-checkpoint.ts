import type { Queryable } from '../queue/queue';

/** Recupera apenas o JSON do fechamento; nunca reexecuta ferramentas de atendimento. */
export class CheckpointInvalidoError extends Error {}

export async function fecharCheckpoint<T, R>(input: {
  chamar: (correcao: boolean) => Promise<R>;
  validar: (resposta: R) => T;
  aoCorrigir: () => void;
}): Promise<{ resposta: R; content: T }> {
  for (let tentativa = 0; ; tentativa++) {
    const resposta = await input.chamar(tentativa > 0);
    try {
      return { resposta, content: input.validar(resposta) };
    } catch (error) {
      // Falha de transporte/banco/orçamento não é erro de formato. Não invente
      // checkpoint nem descarte campos desconhecidos para fazê-lo passar.
      if (!(error instanceof CheckpointInvalidoError) || tentativa >= 1) throw error;
      input.aoCorrigir();
    }
  }
}

/** Falha terminal VISÍVEL, atômica e cercada pelo claim. Só após resposta aceita. */
export async function registrarFechamentoInvalido(
  db: Queryable,
  ids: { organizationId: string; jobId: string; workerId: string; acquiredAt: string },
): Promise<boolean> {
  const { rows } = await db.query(
    `with updated as (
       update job_queue set status='dead', locked_by=null, locked_at=null,
         last_error='checkpoint_invalid_after_reply: fechamento inválido após recuperação; atendimento não repetido'
       where organization_id=$1 and id=$2 and status='running'
         and locked_by=$3 and locked_at=$4::timestamptz
       returning id, organization_id
     ), alert as (
       insert into agent_inbox_items (organization_id, kind, severity, title, body, ref_kind, ref_id)
       select organization_id, 'job_dead', 'critical',
         'No se pudo guardar el resumen de una atención',
         'El cliente ya recibió la respuesta. Falló el formato del resumen en dos intentos. Revise la conversación y los compromisos pendientes; no reenvíe la atención completa.',
         'job_queue', id from updated
     ) select id from updated`,
    [ids.organizationId, ids.jobId, ids.workerId, ids.acquiredAt],
  );
  return rows.length > 0;
}
