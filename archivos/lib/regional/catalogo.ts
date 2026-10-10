import { FUSOS_OFERECIDOS } from "@/lib/tempo/fusos";

/** Configuração operacional; não declara legislação nem validade da identidade. */
export const REGIOES = {
  BR: {
    moeda: "BRL",
    fuso: "America/Sao_Paulo",
    prefixo: "55",
    digitosLocais: [10, 11],
    exemploTelefone: "+5511999998888",
    fiscal: "CNPJ",
    exemploFiscal: "00.000.000/0001-00",
  },
  CO: {
    moeda: "COP",
    fuso: "America/Bogota",
    prefixo: "57",
    digitosLocais: [10],
    exemploTelefone: "+573001234567",
    fiscal: "NIT",
    exemploFiscal: "900123456-8",
  },
  CR: {
    moeda: "CRC",
    fuso: "America/Costa_Rica",
    prefixo: "506",
    digitosLocais: [8],
    exemploTelefone: "+50688881234",
    fiscal: "Cédula jurídica / NITE",
    exemploFiscal: "3-101-123456",
  },
  PA: {
    moeda: "USD",
    fuso: "America/Panama",
    prefixo: "507",
    digitosLocais: [7, 8],
    exemploTelefone: "+50761234567",
    fiscal: "RUC / DV",
    exemploFiscal: "123456-1-123456 DV 00",
  },
  US: {
    moeda: "USD",
    fuso: "America/New_York",
    prefixo: "1",
    digitosLocais: [10],
    exemploTelefone: "+12025550123",
    fiscal: "EIN",
    exemploFiscal: "12-3456789",
  },
} as const;
export type PaisRegional = keyof typeof REGIOES;
export function regiaoDoPais(pais: string | null | undefined) {
  return REGIOES[pais as PaisRegional] ?? REGIOES.BR;
}

/** Identificadores IANA, que incluem as regras de horário de verão. */
export const FUSOS_SERVIDOS = FUSOS_OFERECIDOS.map((f) => f.codigo);
export function fusosComAtual(atual: string): readonly string[] {
  return (FUSOS_SERVIDOS as readonly string[]).includes(atual)
    ? FUSOS_SERVIDOS
    : [...FUSOS_SERVIDOS, atual];
}

/** O + explícito é respeitado: não se troca o país de um cliente internacional. */
export function normalizaTelefoneDoPais(
  raw: string,
  pais: string | null | undefined,
): string | null {
  const texto = raw.trim();
  if (!texto || !/^\+?[\d\s().-]+$/.test(texto)) return null;
  const numeros = texto.replace(/\D/g, "");
  if (texto.startsWith("+")) return /^[1-9]\d{7,14}$/.test(numeros) ? `+${numeros}` : null;
  const regiao = regiaoDoPais(pais);
  if ((regiao.digitosLocais as readonly number[]).includes(numeros.length))
    return `+${regiao.prefixo}${numeros}`;
  if (
    numeros.startsWith(regiao.prefixo) &&
    (regiao.digitosLocais as readonly number[]).includes(numeros.length - regiao.prefixo.length)
  )
    return `+${numeros}`;
  return null;
}

/** Forma apenas. Não consulta órgão emissor nem verifica situação fiscal. */
export function formaFiscalValida(raw: string, pais: string | null | undefined): boolean {
  if (!raw.trim()) return true;
  if (pais === "CO") return /^\d{1,15}(?:-\d)?$/.test(raw.replace(/[.\s]/g, ""));
  if (pais === "CR")
    return /^(?:\d{4}[A-Z0-9]{6}|\d{10}|\d{11,12})$/.test(raw.toUpperCase().replace(/[\s-]/g, ""));
  if (pais === "US") return /^\d{9}$/.test(raw.replace(/[\s-]/g, ""));
  if (pais === "PA") return /^(?=.*\d)[A-Z0-9][A-Z0-9 .-]{1,31}$/i.test(raw.trim());
  return raw.length <= 20; // preserva o contrato brasileiro anterior
}
