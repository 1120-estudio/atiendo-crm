import { describe, expect, it, vi } from "vitest";
import { criarTravaDeRecuperacao, recuperarRespostaAusente } from "./recuperar-resposta";

describe("resposta ausente não termina em sucesso silencioso", () => {
  it("só a primeira chamada de envio da recuperação é admitida, mesmo em paralelo", async () => {
    const admitir = criarTravaDeRecuperacao();
    expect(
      await Promise.all([Promise.resolve().then(admitir), Promise.resolve().then(admitir)]),
    ).toEqual([true, false]);
    expect(admitir()).toBe(false);
    expect(criarTravaDeRecuperacao()()).toBe(true);
  });
  it("recupera uma única vez e exige um desfecho real", async () => {
    let enviado = false;
    const recuperar = vi.fn(async () => {
      enviado = true;
    });
    await recuperarRespostaAusente({
      deveResponder: true,
      temDesfecho: () => enviado,
      tentouEnviar: () => false,
      recuperar,
    });
    expect(recuperar).toHaveBeenCalledTimes(1);
  });

  it("um segundo texto sem envio falha e permite retry da fila", async () => {
    const recuperar = vi.fn(async () => undefined);
    await expect(
      recuperarRespostaAusente({
        deveResponder: true,
        temDesfecho: () => false,
        tentouEnviar: () => false,
        recuperar,
      }),
    ).rejects.toThrow("agent_no_reply");
    expect(recuperar).toHaveBeenCalledTimes(1);
  });

  it("não duplica envio nem interrompe transferência ou adiamento de cap", async () => {
    const recuperar = vi.fn(async () => undefined);
    for (const desfecho of ["envio", "transferência", "cap"]) {
      await recuperarRespostaAusente({
        deveResponder: true,
        temDesfecho: () => Boolean(desfecho),
        tentouEnviar: () => true,
        recuperar,
      });
    }
    expect(recuperar).not.toHaveBeenCalled();
  });

  it("não contorna um envio recusado pelos gates", async () => {
    const recuperar = vi.fn(async () => undefined);
    await expect(
      recuperarRespostaAusente({
        deveResponder: true,
        temDesfecho: () => false,
        tentouEnviar: () => true,
        recuperar,
      }),
    ).rejects.toThrow("agent_no_reply");
    expect(recuperar).not.toHaveBeenCalled();
  });

  it("não envia em prévia, follow-up silencioso ou opt-out", async () => {
    const recuperar = vi.fn(async () => undefined);
    await recuperarRespostaAusente({
      deveResponder: false,
      temDesfecho: () => false,
      tentouEnviar: () => false,
      recuperar,
    });
    expect(recuperar).not.toHaveBeenCalled();
  });
});
