import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMAS, type Idioma } from "@/lib/i18n/idiomas";

/**
 * O idioma que esta instalação declarou em `APP_LOCALE` — server-only, porque
 * lê `lib/env`. Vazio ou fora dos idiomas servidos usa espanhol por padrão.
 *
 * Quem usa: a organização que nasce do cadastro pela tela
 * (`lib/auth/provision.ts`) e o visitante anônimo cujo `Accept-Language` não
 * pede nenhum idioma servido (`lib/i18n/idiomaAnonimo.ts`).
 */
export function idiomaDaInstalacao(): Idioma {
  const idioma = env.APP_LOCALE.trim();
  return (IDIOMAS as readonly string[]).includes(idioma) ? (idioma as Idioma) : "es";
}

/**
 * Título de aba (`export const metadata`) no idioma da instalação. O título é
 * avaliado uma vez por módulo, fora de qualquer requisição, então não há
 * usuário de quem ler a preferência — só a instalação. Sem `APP_LOCALE`,
 * utiliza o espanhol.
 */
export function tituloNoIdiomaDaInstalacao(titulo: string): string {
  return traduzir(titulo, idiomaDaInstalacao());
}
