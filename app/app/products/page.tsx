import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { BUCKET_DAS_FOTOS, fotoPertenceAoProduto } from "@/lib/catalogo/fotos";
import { moedaDaOrganizacao } from "@/lib/catalogo/moeda-da-org";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DO_PRODUTO, type Produto } from "@/lib/schemas/produtos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { ProdutosClient } from "./_client";
import { tituloNoIdiomaDaInstalacao } from "@/lib/i18n/idiomaDaInstalacao";

export const dynamic = "force-dynamic";
export const metadata = { title: tituloNoIdiomaDaInstalacao("Produtos") };

/**
 * O CATÁLOGO DA LOJA — onde o preço que a IA responde é cadastrado.
 *
 * ─── Por que esta tela precisa existir ───────────────────────────────────
 *
 * A ferramenta `crm_search_products` já vinha ligada em todo agente novo, e
 * lia uma tabela que ninguém nunca preencheu. O efeito não era silêncio: era o
 * agente respondendo "não tenho nada com esse nome no catálogo" para uma loja
 * com o estoque cheio. Ferramenta que devolve vazio para 100% das lojas é pior
 * que ferramenta ausente — ela mente com autoridade.
 *
 * ─── Quem pode o quê ─────────────────────────────────────────────────────
 *
 * `viewer` VÊ o catálogo: saber quanto custa é informação de operação, e quem
 * atende precisa dela. Cadastrar e alterar preço é `manager`, e a rota cobra de
 * novo — a tela esconder o botão é cortesia, não autorização.
 */
export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const pagina = Math.max(1, Math.min(100000, Number(query.page) || 1));
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeEditar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const moeda = await moedaDaOrganizacao(supabase, activeOrg.orgId);
  const { data, count } = await supabase
    .from("catalog_products")
    .select(COLUNAS_DO_PRODUTO, { count: "exact" })
    .eq("organization_id", activeOrg.orgId)
    .order("ativo", { ascending: false })
    .order("nome").order("id")
    .range((pagina - 1) * 100, pagina * 100 - 1);
  const produtos = (data ?? []) as unknown as Produto[];

  // O bucket é privado: a tela recebe URL assinada de 1 h, montada aqui. Só
  // caminho que é DO produto (ver `fotoPertenceAoProduto`) — a assinatura é
  // por service role, e a linha é gravável pelo PostgREST.
  const caminhos = produtos.flatMap((p) =>
    (p.fotos ?? []).filter((c) => fotoPertenceAoProduto(c, activeOrg.orgId, p.id)),
  );
  const urlsDasFotos: Record<string, string> = {};
  if (caminhos.length > 0) {
    const { data: assinadas } = await createAdminClient()
      .storage.from(BUCKET_DAS_FOTOS)
      .createSignedUrls(caminhos, 3600);
    for (const a of assinadas ?? []) {
      if (a.path && a.signedUrl) urlsDasFotos[a.path] = a.signedUrl;
    }
  }

  return (
    <>
    <nav aria-label="Páginas del catálogo" className="mx-auto flex max-w-5xl gap-4 px-6 pt-4">
      {pagina > 1 && <a href={`?page=${pagina - 1}`}>Anterior</a>}
      <span>Página {pagina} · {count ?? 0} productos</span>
      {pagina * 100 < (count ?? 0) && <a href={`?page=${pagina + 1}`}>Siguiente</a>}
    </nav>
    <ProdutosClient
      inicial={produtos}
      moeda={moeda}
      urlsDasFotos={urlsDasFotos}
      podeEditar={podeEditar}
      textos={{
        titulo: t("Produtos"),
        subtitulo: t(
          "O catálogo da loja. É daqui que o atendente de IA tira o preço quando alguém pergunta.",
        ),
        vazio: t("Nenhum produto cadastrado ainda"),
        vazioDica: t(
          "Enquanto o catálogo estiver vazio, o atendente responde que não encontrou o produto — mesmo que a loja tenha.",
        ),
      }}
    />
    </>
  );
}
