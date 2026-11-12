import { describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { registrarFalhaLeituraInbox } from "@/lib/inbox/registro-falha-leitura";

describe("diagnóstico de leitura do inbox", () => {
  it("correlaciona o pedido com código seguro sem registrar dados privados", () => {
    const log = vi.spyOn(logger, "error").mockImplementation(() => {});
    registrarFalhaLeituraInbox("mensagens", "request-1", { code: "57014", message: "texto privado" } as { code: string });
    expect(log).toHaveBeenCalledWith("[inbox] falha na leitura", { recurso: "mensagens", requestId: "request-1", codigo: "57014" });
    registrarFalhaLeituraInbox("conversas", "request-2", { code: "texto privado" });
    expect(log).toHaveBeenLastCalledWith("[inbox] falha na leitura", { recurso: "conversas", requestId: "request-2", codigo: "desconhecido" });
    log.mockRestore();
  });
});
