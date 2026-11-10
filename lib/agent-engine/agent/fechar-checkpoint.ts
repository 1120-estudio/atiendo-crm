import type { Queryable } from '../queue/queue';

/** Recupera apenas o JSON do fechamento; nunca reexecuta ferramentas de atendimento. */
export type DiagnosticoCheckpoint = {
  tipo: 'sem_json' | 'json_invalido' | 'estrutura_invalida' | 'desconhecido';
  campo: 'commitments' | 'objections' | 'next_action' | 'rolling_summary' | 'declaracao' | 'raiz';
  codigo: 'invalid_type' | 'unrecognized_keys' | 'too_small' | 'invalid_value' | 'outro';
};

/** Apenas categorias fixas: jamais salvar trecho ou chave criada pelo modelo. */
export class CheckpointInvalidoError extends Error {
  constructor(message: string, public readonly diagnostico: DiagnosticoCheckpoint = {
    tipo: 'desconhecido', campo: 'raiz', codigo: 'outro',
  }) { super(message); }
}

export async function fecharCheckpoint<T, R>(input: {
  chamar: (correcao: boolean) => Promise<R>;
  validar: (resposta: R) => T;
  aoCorrigir: (error: CheckpointInvalidoError) => void;
}): Promise<{ resposta: R; content: T }> {
  for (let tentativa = 0; ; tentativa++) {
    const resposta = await input.chamar(tentativa > 0);
    try {
      return { resposta, content: input.validar(resposta) };
    } catch (error) {
      // Falha de transporte/banco/orçamento não é erro de formato. Não invente
      // checkpoint nem descarte campos desconhecidos para fazê-lo passar.
      if (!(error instanceof CheckpointInvalidoError) || tentativa >= 1) throw error;
      input.aoCorrigir(error);
    }
  }
}

/** Falha terminal VISÍVEL, atômica e cercada pelo claim. Só após resposta aceita. */
export async function registrarFechamentoInvalido(
  db: Queryable,
  ids: { organizationId: string; jobId: string; workerId: string; acquiredAt: string; diagnostico?: DiagnosticoCheckpoint },
): Promise<boolean> {
  const { rows } = await db.query(
    `with updated as (
       update job_queue set status='dead', locked_by=null, locked_at=null,
         last_error=$5
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
    [ids.organizationId, ids.jobId, ids.workerId, ids.acquiredAt,
      `checkpoint_invalid_after_reply: ${formatarDiagnosticoCheckpoint(ids.diagnostico)}; atendimento não repetido`],
  );
  return rows.length > 0;
}

/** O valor cruzará logs, prompt de correção e banco: aceita só vocabulário fixo. */
export function formatarDiagnosticoCheckpoint(value?: DiagnosticoCheckpoint): string {
  const tipos = ['sem_json', 'json_invalido', 'estrutura_invalida', 'desconhecido'];
  const campos = ['commitments', 'objections', 'next_action', 'rolling_summary', 'declaracao', 'raiz'];
  const codigos = ['invalid_type', 'unrecognized_keys', 'too_small', 'invalid_value', 'outro'];
  const tipo = value && tipos.includes(value.tipo) ? value.tipo : 'desconhecido';
  const campo = value && campos.includes(value.campo) ? value.campo : 'raiz';
  const codigo = value && codigos.includes(value.codigo) ? value.codigo : 'outro';
  return `${tipo}:${campo}:${codigo}`;
}

/** Dica genérica que não depende de texto gerado nem informa dados do cliente. */
export function orientacaoDeCorrecaoCheckpoint(value?: DiagnosticoCheckpoint): string {
  const seguro = formatarDiagnosticoCheckpoint(value);
  if (seguro.startsWith('sem_json:') || seguro.startsWith('json_invalido:'))
    return 'Retorne um único objeto JSON válido; não use texto antes ou depois.';
  if (seguro.endsWith(':unrecognized_keys'))
    return 'Remova as chaves não declaradas no campo indicado; preserve os dados nos campos permitidos.';
  if (seguro.endsWith(':invalid_type'))
    return 'Corrija o tipo do campo indicado: listas devem ser arrays, textos strings e valores ausentes null quando permitido.';
  if (seguro.endsWith(':too_small'))
    return 'Preencha os campos obrigatórios com conteúdo sustentado pela conversa; não invente.';
  return 'Revise a estrutura do JSON e use somente os campos e tipos solicitados.';
}
