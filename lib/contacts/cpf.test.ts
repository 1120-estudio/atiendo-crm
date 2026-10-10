import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const { key, log } = vi.hoisted(() => ({ key: "a".repeat(64), log: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { CPF_ENCRYPTION_KEY: key } }));
vi.mock("@/lib/logger", () => ({ logger: { error: log } }));
import { encryptCpfSql } from "./cpf";

describe("documento cifrado para PostgREST", () => {
  it("envia a chave pelo backend e preserva a literal bytea", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "\\xab12cd", error: null });
    expect(await encryptCpfSql({ rpc } as unknown as SupabaseClient, "123456789")).toBe(
      "\\xab12cd",
    );
    expect(rpc).toHaveBeenCalledWith("encrypt_cpf", { p_plaintext: "123456789", p_key: key });
  });
  it.each([null, "", "texto-em-claro", { 0: 1 }, "\\xzz", "\\xabc"])(
    "recusa retorno sem cifra válida (%j)",
    async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      expect(await encryptCpfSql({ rpc } as unknown as SupabaseClient, "123456789")).toBeNull();
    },
  );
  it("não registra chave, documento nem argumentos no erro", async () => {
    log.mockClear();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: key + " 123456789" } });
    expect(await encryptCpfSql({ rpc } as unknown as SupabaseClient, "123456789")).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain(key);
    expect(JSON.stringify(log.mock.calls)).not.toContain("123456789");
  });
  it("falha de transporte também impede o hash órfão", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("rede"));
    expect(await encryptCpfSql({ rpc } as unknown as SupabaseClient, "123456789")).toBeNull();
  });
});
