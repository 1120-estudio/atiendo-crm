import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { formatCents, MOEDAS_SERVIDAS } from "@/lib/money";
import { perfilDoPais, paisesOferecidos, citacaoDaLei } from "@/lib/legal/perfil-do-pais";
import {
  normalizaTelefoneDoPais,
  regiaoDoPais,
  FUSOS_SERVIDOS,
  formaFiscalValida,
} from "./catalogo";
import { contactCreateSchemaDoPais } from "@/lib/schemas/contacts";
import { tenantSchema } from "@/lib/schemas/settings";
import { hashCpf } from "@/lib/contacts/cpf";
import { mapHeader, mapLinha } from "@/lib/contacts/csv";
import { anonymize, padroesDePii } from "@/lib/ai/anonymize";

const CASOS = [
  {
    pais: "CO",
    moeda: "COP",
    telefone: "300 123 4567",
    e164: "+573001234567",
    documento: "1.234.567.890",
    gravado: "1234567890",
    fiscal: "900123456-8",
  },
  {
    pais: "CR",
    moeda: "CRC",
    telefone: "8888-1234",
    e164: "+50688881234",
    documento: "1-1234-1234",
    gravado: "112341234",
    fiscal: "3-101-123456",
  },
  {
    pais: "PA",
    moeda: "USD",
    telefone: "6123-4567",
    e164: "+50761234567",
    documento: "8-123-4567",
    gravado: "8-123-4567",
    fiscal: "123456-1-123456 DV 00",
  },
  {
    pais: "US",
    moeda: "USD",
    telefone: "(202) 555-0123",
    e164: "+12025550123",
    documento: "123-45-6789",
    gravado: "123456789",
    fiscal: "12-3456789",
  },
];
for (const c of CASOS)
  describe(c.pais, () => {
    it("pode ser escolhido sem afirmar lei brasileira", () => {
      expect(paisesOferecidos().map((p) => p.codigo)).toContain(c.pais);
      expect(citacaoDaLei(perfilDoPais(c.pais))).toBeNull();
      expect(perfilDoPais(c.pais).calendario.feriados).toEqual([]);
    });
    it("serve moeda e fuso IANA do país", () => {
      expect(MOEDAS_SERVIDAS).toContain(c.moeda);
      expect(regiaoDoPais(c.pais).moeda).toBe(c.moeda);
      expect(FUSOS_SERVIDOS).toContain(regiaoDoPais(c.pais).fuso);
      expect(
        new Intl.DateTimeFormat("es", { timeZone: regiaoDoPais(c.pais).fuso }).resolvedOptions()
          .timeZone,
      ).toBeTruthy();
      expect(formatCents(123450, c.moeda)).not.toContain("NaN");
    });
    it("telefone local ganha o prefixo certo; explícito internacional é preservado", () => {
      expect(normalizaTelefoneDoPais(c.telefone, c.pais)).toBe(c.e164);
      expect(normalizaTelefoneDoPais("+50688881234", c.pais)).toBe("+50688881234");
      expect(normalizaTelefoneDoPais("abc" + c.telefone, c.pais)).toBeNull();
      expect(normalizaTelefoneDoPais("123", c.pais)).toBeNull();
    });
    it("a validação do contato não exige CPF brasileiro e preserva o documento", () => {
      const schema = contactCreateSchemaDoPais(perfilDoPais(c.pais));
      expect(schema.parse({ email: "teste@example.test", cpf: c.documento }).cpf).toBe(c.gravado);
      expect(schema.safeParse({ cpf: "<invalid>" }).success).toBe(false);
    });
    it("a planilha usa os mesmos documentos e telefones", () => {
      const doc = perfilDoPais(c.pais).documento;
      const { indices } = mapHeader(["teléfono", "documento"], undefined, doc);
      const linha = mapLinha([c.telefone, c.documento], indices, undefined, doc, c.pais);
      expect(linha.motivo).toBeNull();
      expect(linha.contato).toMatchObject({ cpf: c.gravado, phone_number: c.e164 });
    });
    it("permite gravar identificador fiscal e região na empresa", () => {
      expect(formaFiscalValida(c.fiscal, c.pais)).toBe(true);
      expect(
        tenantSchema.safeParse({
          display_name: "Empresa",
          legal_name: "Empresa",
          cnpj: c.fiscal,
          country: c.pais,
          currency: c.moeda,
          timezone: regiaoDoPais(c.pais).fuso,
          locale: "es",
          media_retention_days: 90,
        }).success,
      ).toBe(true);
    });
  });
it("mantém o hash de CPF existente e distingue passaportes e cédulas estruturadas", () => {
  expect(hashCpf("529.982.247-25")).toBe(createHash("sha256").update("52998224725").digest("hex"));
  expect(hashCpf("AB123456")).not.toBe(hashCpf("CD123456"));
  expect(hashCpf("8-12-345")).not.toBe(hashCpf("8-123-45"));
});
it("a cédula jurídica da Costa Rica pode preservar letras no novo consecutivo", () => {
  expect(formaFiscalValida("3-101-A12345", "CR")).toBe(true);
});
it("identificadores fiscais malformados são recusados", () => {
  for (const pais of ["CO", "CR", "US"]) expect(formaFiscalValida("inválido", pais)).toBe(false);
});
it("documento rotulado não chega ao modelo em texto aberto", () => {
  const resultado = anonymize("SSN: 123-45-6789", padroesDePii([perfilDoPais("US")]));
  expect(resultado.anonymized).not.toContain("123-45-6789");
});

it("a redação reconhece rótulos em caixa baixa sem consumir o texto seguinte", () => {
  const resultado = anonymize(
    "cédula: 8-123-4567 pedido pendente",
    padroesDePii([perfilDoPais("PA")]),
  );
  expect(resultado.anonymized).toContain("pedido pendente");
  expect(resultado.anonymized).not.toContain("8-123-4567");
});
