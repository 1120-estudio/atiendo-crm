import { notFound } from "next/navigation";
import { CampoDeLogo } from "@/components/branding/CampoDeLogo";
import { Card } from "@/components/ui/card";
import { loadAuthUser } from "@/lib/auth/server";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import { camadaDaInstalacao, camadaDoAmbiente, resolverMarca } from "@/lib/branding/resolve";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { tituloNoIdiomaDaInstalacao } from "@/lib/i18n/idiomaDaInstalacao";

export const metadata = { title: tituloNoIdiomaDaInstalacao("Logo") };
export const dynamic = "force-dynamic";

export default async function LogoDaInstalacaoPage() {
  const user = await loadAuthUser();
  if (!user?.is_platform_admin || user.support) notFound();
  const linha = await marcaDaInstalacao();
  const marca = resolverMarca([camadaDaInstalacao(linha), camadaDoAmbiente(env)], REGUA_DO_PRODUTO);
  const herdada = resolverMarca([camadaDaInstalacao(linha ? { ...linha, logo_path: null, logo_dark_path: null } : null), camadaDoAmbiente(env)], REGUA_DO_PRODUTO);
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Logo da instalação")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Personalize o logo da instalação. As cores da interface são fixas.")}</p>
      </header>
      <Card className="max-w-3xl space-y-4 p-6">
        <CampoDeLogo escopo="instalacao" logoDaCamada={{ url: linha?.logo_path ? marca.logoUrl : null, escuraUrl: linha?.logo_dark_path ? marca.logoDarkUrl : null }} logoHerdado={herdada.logoUrl} logoEscuroHerdado={herdada.logoDarkUrl} origemDoHerdado="do arquivo de instalação do servidor" nomeEmVigor={marca.name} />
      </Card>
    </div>
  );
}
