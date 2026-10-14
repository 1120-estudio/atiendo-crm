import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/** Solo los encabezados del sistema. Las citas y los datos del cliente se conservan. */
const CABECALHOS = [
  "Por que a IA passou:",
  "Quem passou escreveu:",
  "O que o cliente quer (segundo a IA — confira):",
  "O que a IA já tentou:",
  "Últimas mensagens do cliente (palavras dele):",
  "Contexto acumulado (segundo a IA — confira):",
  "Compromissos:",
  "Objeções:",
  "Próxima ação:",
  "O que a pessoa quer:",
  "Prometido a ela:",
  "Caso:",
  "Bloqueio:",
  "A pessoa que escalou escreveu:",
] as const;

/** También alcanza transferencias existentes, sin reescribir el historial. */
export function localizarBriefing(texto: string, idioma: Idioma): string {
  if (idioma === "pt-BR") return texto;
  return texto
    .split("\n")
    .map((linha) => {
      const cabecalho = CABECALHOS.find((c) => linha.startsWith(c));
      if (!cabecalho) return linha;
      const restante = linha.slice(cabecalho.length);
      // El motivo fijo puede traducirse; la explicación libre conserva su autoría.
      return (
        traduzir(cabecalho, idioma) +
        (cabecalho === "Por que a IA passou:"
          ? " " + traduzir(restante.trimStart(), idioma)
          : restante)
      );
    })
    .join("\n");
}
