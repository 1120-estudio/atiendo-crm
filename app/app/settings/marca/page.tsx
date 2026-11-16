import { redirect } from "next/navigation";
import { CampoDeLogo } from "@/components/branding/CampoDeLogo";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { tituloNoIdiomaDaInstalacao } from "@/lib/i18n/idiomaDaInstalacao";

export const metadata = { title: tituloNoIdiomaDaInstalacao("Logo") };
export const dynamic = "force-dynamic";

export default async function LogoDaOrganizacaoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[org.role] < ROLE_RANK.admin) redirect("/403");

  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  const instalacao = await marcaDaInstalacao();
  const marca = resolverMarcaDaOrganizacao(data?.settings ?? null, instalacao, env);
  const herdada = resolverMarcaDaOrganizacao(null, instalacao, env);
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Logo da empresa")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("Personalize o logo da sua empresa. As cores da interface são fixas.")}</p>
      </header>
      <Card className="max-w-3xl space-y-4 p-6">
        <CampoDeLogo
          escopo="organizacao"
          logoDaCamada={{
            url: marca.origens.logoUrl === "organizacao" ? marca.logoUrl : null,
            escuraUrl: marca.origens.logoDarkUrl === "organizacao" ? marca.logoDarkUrl : null,
          }}
          logoHerdado={herdada.logoUrl}
          logoEscuroHerdado={herdada.logoDarkUrl}
          origemDoHerdado="de quem instalou o sistema"
          nomeEmVigor={marca.name}
        />
      </Card>
    </div>
  );
}
