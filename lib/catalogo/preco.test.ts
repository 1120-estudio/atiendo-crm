import { describe, expect, it } from "vitest";
import { precoParaCentavos } from "@/lib/schemas/produtos";
import { formatPrecoDoCatalogo, precoParaEdicao } from "./preco";

describe("preço do catálogo: valor ×100 em qualquer moeda", () => {
  it.each(["COP", "CRC", "USD", "MXN", "BRL", "CLP", "JPY", "PYG"])(
    "reabre e salva %s sem alterar a unidade ou o preço",
    (moeda) => {
      const cents = precoParaCentavos("24950")!;
      expect(precoParaCentavos(precoParaEdicao(cents))).toBe(cents);
      // A parte inteira deve conter 24950, não 2495000. Intl muda só a apresentação.
      const texto = formatPrecoDoCatalogo(cents, moeda);
      const digitos = texto.replace(/\D/g, "");
      expect(["24950", "2495000"]).toContain(digitos);
      expect(texto).not.toMatch(/2[.,]495[.,]000/);
    },
  );
  it.each(["24950", "24.950", "24,950", "24950.00", "24.950,00", "24,950.00"])(
    "interpreta %s como 24 950 e conserva o valor ao editar",
    (texto) => {
      expect(precoParaCentavos(texto)).toBe(2495000);
      expect(precoParaEdicao(2495000)).toBe("24950.00");
    },
  );
});
