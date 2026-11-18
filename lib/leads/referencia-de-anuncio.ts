/**
 * Campos visuales mínimos de un anuncio que inició una conversación.
 * El proveedor puede enviar formas distintas; esta función solo conserva
 * contenido seguro para mostrar en la burbuja del inbox.
 */
export interface ReferenciaDeAnuncio {
  titulo: string | null;
  texto: string | null;
  url: string | null;
  imagenUrl: string | null;
}

type Registro = Record<string, unknown>;

function registro(value: unknown): Registro | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Registro)
    : null;
}

function texto(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function urlHttps(value: unknown): string | null {
  const raw = texto(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/** Devuelve null para referrals orgánicos o que no tienen tarjeta visible. */
export function normalizarReferenciaDeAnuncio(value: unknown): ReferenciaDeAnuncio | null {
  const raw = registro(value);
  if (!raw) return null;

  const sourceType = texto(raw.source_type, raw.sourceType);
  const tipoNormalizado = sourceType?.toLowerCase();
  if (tipoNormalizado && tipoNormalizado !== "ad") return null;

  const titulo = texto(raw.headline, raw.title);
  const cuerpo = texto(raw.body, raw.description);
  const url = urlHttps(raw.source_url ?? raw.sourceUrl ?? raw.url);
  const adId = texto(raw.source_id, raw.sourceId);
  const imagenUrl = urlHttps(
    raw.image_url ?? raw.imageUrl ?? raw.thumbnail_url ?? raw.thumbnailUrl ?? raw.thumbnail,
  );

  if (tipoNormalizado !== "ad" && !titulo && !url && !adId) return null;
  if (!titulo && !cuerpo && !url && !imagenUrl) return null;
  return { titulo, texto: cuerpo, url, imagenUrl };
}
