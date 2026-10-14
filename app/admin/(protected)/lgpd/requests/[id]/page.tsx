import { tituloNoIdiomaDaInstalacao } from "@/lib/i18n/idiomaDaInstalacao";
import { LgpdRequestAdminDetail } from "./_client";

export const metadata = {
  title: tituloNoIdiomaDaInstalacao("Solicitação LGPD — Admin"),
};

export default async function AdminLgpdRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LgpdRequestAdminDetail id={id} />;
}
