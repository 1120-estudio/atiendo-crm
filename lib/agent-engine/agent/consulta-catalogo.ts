import type { GateVerdict } from '../guardrails/before-send';

export const INSTRUCAO_CATALOGO =
  '## Catálogo antes de recomendar\n' +
  'Você tem crm_search_products. Consulte-a ANTES de recomendar produtos, informar preços, ' +
  'características ou disponibilidade, ou perguntar entre variantes de um produto. Isso inclui ' +
  'pedidos gerais por categoria: primeiro procure o que existe, depois mostre até cinco opções ' +
  'reais com preço. Não substitua a busca por perguntas genéricas de vendas. ' +
  'Se houver várias consultas vigentes, procure cada uma separadamente. Remova conectivos ' +
  'conversacionais como “y”, mas preserve a identidade, o código e as restrições do pedido. ' +
  'Não trate cancelamento ou retificação como outro produto a oferecer: pedidos substituídos ' +
  'saem também das sugestões, fotos e perguntas finais. ' +
  'Só pergunte entre variantes que o catálogo realmente devolveu; não presuma novo/usado, ' +
  'com/sem fio, marcas ou modelos. Se a categoria não encontrar resultados, tente um termo ' +
  'relacionado sustentado pelo contexto, ou peça o tipo/nome/código sem inventar alternativas. ' +
  'Busca vazia não demonstra ausência de toda uma categoria quando os produtos não estão ' +
  'classificados. Não invente estoque, preço ou características. Responda no idioma do cliente.';

export interface ConsultaCatalogo {
  disponivel: boolean;
  consultou: boolean;
  variantes?: string[];
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const VARIANTES = [
  { id: 'sin_cable', padrao: /\b(?:inalambric[oa]s?|sem fio|sin cable)\b/ },
  { id: 'con_cable', padrao: /\b(?:alambric[oa]s?|con cable|com fio)\b/ },
  { id: 'nuevo', padrao: /\b(?:nuev[oa]s?|nov[oa]s?)\b/ },
  { id: 'usado', padrao: /\b(?:usad[oa]s?)\b/ },
] as const;

/** Estado por turno: só conta resposta concluída, inclusive resultado vazio. */
export function criarConsultaCatalogo(): {
  estado: ConsultaCatalogo;
  registrar: (resultado: unknown) => void;
} {
  const estado: ConsultaCatalogo = { disponivel: false, consultou: false, variantes: [] };
  return {
    estado,
    registrar(resultado) {
      if (resultado === null || typeof resultado !== 'object') return;
      const produtos = (resultado as { produtos?: unknown }).produtos;
      if (!Array.isArray(produtos)) return;
      estado.consultou = true;
      for (const produto of produtos) {
        if (!produto || typeof produto !== 'object') continue;
        const campos = produto as Record<string, unknown>;
        const texto = normalizar([campos.nome, campos.descricao].filter(v => typeof v === 'string').join(' '));
        for (const v of VARIANTES) if (v.padrao.test(texto) && !estado.variantes!.includes(v.id)) estado.variantes!.push(v.id);
      }
    },
  };
}

/** Rede lexical PT/ES, não um classificador semântico nem prova de todas as alegações. */
export function avaliarConsultaCatalogo(body: string, estado?: ConsultaCatalogo): GateVerdict {
  if (!estado?.disponivel) return { pass: true };
  const texto = normalizar(body);
  // A pergunta oferece uma opção, mesmo sem afirmar estoque. Não derive
  // “com fio” de “cabo de carga”, nem “novo/usado” de uma regra genérica de vendas.
  const pergunta = /[?¿]|\b(?:prefieres|quieres|buscas|necesitas|prefere|quer|procura)\b/.test(texto);
  if (estado.consultou) {
    if (pergunta && estado.variantes !== undefined && VARIANTES.some(v => v.padrao.test(texto) && !estado.variantes!.includes(v.id))) {
      return { pass: false, code: 'catalogo_variante_no_confirmada', reason: 'A pergunta oferece uma variante não confirmada nos resultados. Não pergunte entre opções presumidas; mostre os produtos encontrados ou peça o tipo/nome/código sem inventar variantes.' };
    }
    return { pass: true };
  }
  const comercial = /[₡$€£]|\b(?:precio|preco|cuesta|custa|cost[oa]|estoque|stock|disponib\w*|disponive\w*|inalambric[oa]s?|sem fio|con cable|com fio|nuev[oa]s?|usad[oa]s?)\b/.test(texto) ||
    /\b(?:incluye|inclui|tenemos|vendemos|recomiendo|recomendo|si tengo|tenho uma opcao)\b/.test(texto);
  if (!comercial) return { pass: true };
  return {
    pass: false,
    code: 'catalogo_sin_consulta',
    reason: 'Consulte crm_search_products antes desta resposta comercial. Use o pedido vigente completo. ' +
      'Não pergunte entre variantes presumidas; apresente somente opções e dados confirmados pelo catálogo.',
  };
}
