import { logger } from "@/lib/logger";

/** Correlação sem mensagens SQL, texto de clientes, telefone ou credenciais. */
export function registrarFalhaLeituraInbox(
  recurso: "conversas" | "mensagens",
  requestId: string,
  erro: { code?: unknown },
): void {
  const code = typeof erro.code === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(erro.code)
    ? erro.code
    : "desconhecido";
  logger.error("[inbox] falha na leitura", { recurso, requestId, codigo: code });
}
