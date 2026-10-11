import { formatValorDoNegocio } from "@/lib/money";

/**
 * O cadastro manual e o CSV guardam valor × 100 em TODA moeda.
 * COP, CLP e JPY têm zero casas no Intl: tratá-los como unidades menores
 * em `formatCents` mostrava e cotava um preço cem vezes maior.
 * Esta ponte mantém o contrato dos registros existentes, sem reescrever dados.
 */
export function formatPrecoDoCatalogo(precoCents: number, moeda: string): string {
  return formatValorDoNegocio(precoCents, moeda);
}

/** Texto sem milhar para reabrir o formulário sem alterar o valor guardado. */
export function precoParaEdicao(precoCents: number): string {
  return (precoCents / 100).toFixed(2);
}
