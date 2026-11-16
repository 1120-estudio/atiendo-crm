import { traduzir } from "./dicionario";
import type { Idioma } from "./idiomas";

/** Traduz apenas textos produzidos pelo sistema; conteúdo livre permanece intacto. */
export function traduzirAvisoDoSistema(kind: string, titulo: string, texto: string, idioma: Idioma): string {
  const automaticos = ["event_dead", "job_dead", "message_send_stuck", "qr_rescan", "channel_number_alert", "midia_nao_lida"];
  const saudeConhecida = kind === "other" && [
    "Número novo aguardando liberação (go-live)",
    "O assistente quis marcar um negócio como perdido — e isso exige um motivo",
  ].includes(titulo);
  if (!automaticos.includes(kind) && !saudeConhecida) return texto;

  let resultado = traduzir(texto, idioma);
  if (idioma !== "es") return resultado;
  // Os corpos de mídia são montados em partes e guardados no banco. Traduzir
  // somente trechos conhecidos preserva diagnósticos externos e texto livre.
  if (kind === "midia_nao_lida") {
    const trechos = [
      "a leitura deu erro em todas as tentativas, ao abrir o arquivo ou ao chamar o provedor de IA",
      "O conteúdo do arquivo não chegou ao agente. Da próxima mensagem em diante ele sabe que houve um arquivo que não deu para ler, e responde avisando em vez de supor o que estava nele.",
      "Enquanto isso, o agente responde avisando que não conseguiu abrir o arquivo.",
      "Para resolver, ajuste o modelo desse ponto em Agente de IA → Provedores, ou cadastre a chave necessária em Credenciais.",
      "Detalhe técnico, para quem der suporte:",
    ];
    for (const trecho of trechos) resultado = resultado.replace(trecho, traduzir(trecho, idioma));
  }
  if (kind === "event_dead" || kind === "midia_nao_lida") {
    const erro = "org sem credencial LLM utilizável — cadastre uma chave BYOK ativa/validada em ai_provider_credentials ou defina ANTHROPIC_API_KEY / OPENAI_API_KEY (fallback de plataforma, conforme o provider do modelo)";
    // O emissor de mídia limita o detalhe técnico a 200 caracteres.
    resultado = resultado.replace(erro, traduzir(erro, idioma)).replace(erro.slice(0, 200), traduzir(erro, idioma));
  }
  return resultado;
}
