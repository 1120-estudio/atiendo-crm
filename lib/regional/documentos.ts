import type { DocumentoDoTitular, PerfilDoPais } from "@/lib/legal/perfil-do-pais";

/** Uma validação de forma nunca prova emissão, titularidade ou situação fiscal. */
function documento(
  rotulo: string,
  exemplo: string,
  apelidos: string[],
  valida: (valor: string) => boolean,
  normaliza = (valor: string) => valor.toUpperCase().replace(/[.\s-]/g, ""),
): DocumentoDoTitular {
  return {
    rotulo,
    exemplo,
    apelidosDoCabecalho: ["documento", "documento_personal", ...apelidos],
    regra: "forma; não confere emissão nem dígito verificador",
    mensagemInvalido:
      "Documento inválido: confira o formato; a validação não comprova a identidade.",
    confereDigito: false,
    normaliza,
    valida,
  };
}
const compacto = (valor: string) => valor.toUpperCase().replace(/[.\s-]/g, "");
const passaporte = (valor: string) => /^(?=.*[A-Z])[A-Z0-9]{6,20}$/.test(compacto(valor));

const rotulosDeDocumento = [
  "SSN",
  "ITIN",
  "CC",
  "CE",
  "CPF",
  "cedula",
  "cédula",
  "DIMEX",
  "pasaporte",
  "passport",
  "NIT",
  "RUC",
  "EIN",
]
  .map((rotulo) =>
    [...rotulo].map((letra) => `[${letra.toUpperCase()}${letra.toLowerCase()}]`).join(""),
  )
  .join("|");

export function perfisRegionais(): Record<string, PerfilDoPais> {
  const docs = {
    CO: documento(
      "Cédula / CE / pasaporte",
      "1234567890",
      ["cedula", "cc", "ce", "pasaporte"],
      (v) => /^\d{1,12}$/.test(compacto(v)) || passaporte(v),
    ),
    CR: documento(
      "Cédula / DIMEX / pasaporte",
      "1-1234-1234",
      ["cedula", "cedula_fisica", "dimex", "pasaporte"],
      (v) => /^(?:\d{9}|\d{11,12})$/.test(compacto(v)) || passaporte(v),
    ),
    PA: documento(
      "Cédula / pasaporte",
      "8-123-4567",
      ["cedula", "cedula_de_identidad", "pasaporte"],
      (v) =>
        /^[A-Z0-9]{1,6}-\d{1,5}-\d{1,6}$/i.test(v.trim()) ||
        /^(?:PE|E|N)[- ]?\d{1,9}$/i.test(v.trim()) ||
        passaporte(v),
      (v) => v.toUpperCase().replace(/[.\s]/g, ""),
    ),
    US: documento(
      "SSN / ITIN / pasaporte",
      "123-45-6789",
      ["ssn", "itin", "passport", "pasaporte"],
      (v) => /^\d{9}$/.test(compacto(v)) || passaporte(v),
    ),
  };
  const nomes = { CO: "Colombia", CR: "Costa Rica", PA: "Panamá", US: "Estados Unidos" };
  return Object.fromEntries(
    Object.entries(docs).map(([codigo, doc]) => [
      codigo,
      {
        codigo,
        nome: nomes[codigo as keyof typeof nomes],
        operacional: true,
        documento: doc,
        lei: null,
        calendario: { feriados: [], rotulo: "segunda a sexta; feriados locais não configurados" },
        padroesDePii: [
          {
            tipo: "documento",
            marcador: "[DOCUMENTO]",
            fonte: `\\b(?:${rotulosDeDocumento})[ \t]*[:#-]?[ \t]*[A-Za-z0-9][A-Za-z0-9.-]{3,30}\\b`,
            naoCobre:
              "documento sem rótulo, fora dos formatos reconhecidos; não identifica titularidade",
          },
          ...(codigo === "US"
            ? [
                {
                  tipo: "ssn",
                  marcador: "[SSN]",
                  fonte: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
                  naoCobre: "SSN sem separadores e passaporte sem rótulo",
                },
              ]
            : []),
        ],
      },
    ]),
  );
}
