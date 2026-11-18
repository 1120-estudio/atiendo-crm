"use client";

import { useT } from "@/hooks/i18n/useT";
import type { ReferenciaDeAnuncio } from "@/lib/leads/referencia-de-anuncio";

export function AdReferralCard({ referencia }: { referencia: ReferenciaDeAnuncio }) {
  const t = useT();
  const contenido = (
    <div className="overflow-hidden rounded-lg border border-border bg-background/70">
      {referencia.imagenUrl && (
        <img
          src={referencia.imagenUrl}
          alt={referencia.titulo ?? t("Imagem")}
          loading="lazy"
          className="max-h-56 w-full object-cover"
        />
      )}
      <div className="space-y-1 p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
          {t("Anúncio")}
        </div>
        {referencia.titulo && <div className="font-semibold leading-snug">{referencia.titulo}</div>}
        {referencia.texto && (
          <p className="line-clamp-4 whitespace-pre-wrap wrap-anywhere text-xs leading-snug opacity-80">
            {referencia.texto}
          </p>
        )}
        {referencia.url && <div className="truncate text-xs underline">{t("Abrir link")}</div>}
      </div>
    </div>
  );

  return referencia.url ? (
    <a
      href={referencia.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-2 block max-w-72 overflow-hidden rounded-lg text-inherit no-underline"
      aria-label={referencia.titulo ? `${t("Abrir link")}: ${referencia.titulo}` : t("Anúncio")}
    >
      {contenido}
    </a>
  ) : (
    <div className="mb-2 max-w-72">{contenido}</div>
  );
}
