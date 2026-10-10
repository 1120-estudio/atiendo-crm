/**
 * CPF normalization + hashing helpers.
 *
 * `cpf_hash` is sha256(hex) of the 11-digit normalized CPF — used for exact-match
 * lookup and dedup without exposing plaintext. At-rest encryption (column
 * `cpf_encrypted bytea`) requires a server-side `encrypt_cpf` SQL function which
 * is not yet provisioned — see follow-up note in EPIC-05 commit message.
 */
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

/**
 * At-rest CPF encryption via pgcrypto-backed `encrypt_cpf` RPC.
 *
 * Returns null when the RPC is not yet provisioned in the database — caller
 * should still persist `cpf_hash` and emit a single console.warn (we tolerate
 * the gap until the migration lands).
 */
export async function encryptCpfSql(
  supabase: SupabaseClient,
  plaintext: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.rpc("encrypt_cpf", { p_plaintext: plaintext });
  if (error) {
    console.warn(
      "[contacts.cpf] encrypt_cpf RPC unavailable — storing cpf_hash only.",
      error.message,
    );
    return null;
  }
  if (!data) return null;
  return data as Uint8Array;
}
