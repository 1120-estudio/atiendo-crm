import { describe, expect, it } from "vitest";
import { sentimentoExigeAtendimento } from "./sentiment";

describe("limiar da transferência por sentimento", () => {
  it("inclui a nota no limite e mantém neutros acima dele", () => {
    expect(sentimentoExigeAtendimento(0.29, 0.3)).toBe(true);
    expect(sentimentoExigeAtendimento(0.3, 0.3)).toBe(true);
    expect(sentimentoExigeAtendimento(0.31, 0.3)).toBe(false);
  });
  it("preserva o limiar zero como desligado", () => {
    expect(sentimentoExigeAtendimento(0, 0)).toBe(false);
  });
});
