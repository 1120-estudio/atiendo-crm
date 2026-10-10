/** Documento pessoal: hash para dedupe e pgp_sym AES-256 para recuperação autorizada. */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeCpf(raw: string): string {
  const compacto = raw.toUpperCase().replace(/[.\s]/g, "");
  // Os CPFs existentes mantêm o hash. Em cédulas estruturadas, os hífens
  // distinguem números diferentes (8-12-345 não é 8-123-45).
  if (/^\d{9}-\d{2}$/.test(compacto)) return compacto.replace(/-/g, "");
  return compacto.replace(/[^A-Z0-9-]/g, "");
}

/**
 * Stable sha256 hex of normalized CPF for fuzzy/exact search via `cpf_hash`.
 */
export function hashCpf(raw: string): string {
  return createHash("sha256").update(normalizeCpf(raw)).digest("hex");
}

/** Sem cifra confirmada, o chamador recusa a escrita do documento. */
export async function encryptCpfSql(
  supabase: SupabaseClient,
  plaintext: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("encrypt_cpf", {
      p_plaintext: plaintext,
      p_key: env.CPF_ENCRYPTION_KEY,
    });
    if (error || typeof data !== "string" || !/^\\x(?:[0-9a-f]{2})+$/i.test(data)) {
      // Não registrar o erro do servidor: ele pode conter argumentos da RPC.
      logger.error("[contacts.document] encryption unavailable");
      return null;
    }
    return data;
  } catch {
    logger.error("[contacts.document] encryption unavailable");
    return null;
  }
}
