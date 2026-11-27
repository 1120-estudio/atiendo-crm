import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

type Punto = [number, number]; // longitud, latitud (WGS84)
const cr = ([x, y]: Punto) =>
  Number.isFinite(x) && Number.isFinite(y) && x >= -88 && x <= -82 && y >= 5 && y <= 12;
const hosts = new Set([
  "maps.google.com",
  "maps.google.co.cr",
  "www.google.com",
  "google.com",
  "www.google.co.cr",
  "google.co.cr",
  "maps.app.goo.gl",
  "goo.gl",
  "www.waze.com",
  "waze.com",
]);
function mapa(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    hosts.has(url.hostname)
  );
}
function coordenadas(texto: string | null): Punto | null {
  const m = texto?.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const punto: Punto = [Number(m[2]), Number(m[1])];
  return cr(punto) ? punto : null;
}

function wazeHash(hash: string): Punto | null {
  if (!/^[0123456789bcdefghjkmnpqrstuvwxyz]{9,12}$/.test(hash)) return null;
  const rangos: [Punto, Punto] = [
    [-180, 180],
    [-90, 90],
  ];
  let eje: 0 | 1 = 0;
  for (const letra of hash) {
    const n = "0123456789bcdefghjkmnpqrstuvwxyz".indexOf(letra);
    for (const bit of [16, 8, 4, 2, 1]) {
      const r = rangos[eje],
        mitad = (r[0] + r[1]) / 2;
      r[n & bit ? 0 : 1] = mitad;
      eje = eje === 0 ? 1 : 0;
    }
  }
  const p: Punto = [(rangos[0][0] + rangos[0][1]) / 2, (rangos[1][0] + rangos[1][1]) / 2];
  return cr(p) ? p : null;
}

export async function puntoDeEnlace(enlace: string): Promise<Punto | null> {
  let url: URL;
  try {
    url = new URL(enlace);
  } catch {
    return null;
  }
  for (let paso = 0; paso < 5 && mapa(url); paso++) {
    if (
      /\/dir(?:\/|$)/.test(url.pathname) ||
      ["origin", "destination", "saddr", "daddr", "waypoints"].some((k) => url.searchParams.has(k))
    )
      return null;
    if (
      url.hostname === "maps.app.goo.gl" ||
      (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"))
    ) {
      const r = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });
      const siguiente = r.headers.get("location");
      if (r.status < 300 || r.status >= 400 || !siguiente) return null;
      url = new URL(siguiente, url);
      continue;
    }
    if (url.hostname.endsWith("waze.com")) {
      const ll = url.searchParams.get("ll");
      if (ll) return coordenadas(ll);
      const destino = url.searchParams.get("to");
      if (destino?.startsWith("ll.")) return coordenadas(destino.slice(3));
      if (destino || url.searchParams.has("q")) return null;
      return wazeHash(
        url.searchParams.get("h") ?? url.pathname.match(/^\/ul\/h([a-z0-9]+)\/?$/)?.[1] ?? "",
      );
    }
    if (!url.hostname.startsWith("maps.") && !/^\/maps(?:\/|$)/.test(url.pathname)) return null;
    const punto =
      coordenadas(url.searchParams.get("query")) ?? coordenadas(url.searchParams.get("q"));
    if (punto) return punto;
    // @lat,lng suele ser el centro de la cámara; sólo usar un marcador de lugar.
    const marcas = [...url.pathname.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
    return marcas.length === 1 && url.pathname.includes("/place/")
      ? coordenadas(marcas[0]![1] + "," + marcas[0]![2])
      : null;
  }
  return null;
}

const anillo = z.array(z.tuple([z.number(), z.number()])).min(4);
const poligono = z.array(anillo).min(1);
const archivo = z.object({
  type: z.literal("FeatureCollection"),
  features: z
    .array(
      z.object({
        properties: z.object({ codigo: z.string().regex(/^\d{5}$/) }),
        geometry: z.discriminatedUnion("type", [
          z.object({ type: z.literal("Polygon"), coordinates: poligono }),
          z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(poligono).min(1) }),
        ]),
      }),
    )
    .min(1),
});
type Mapa = z.infer<typeof archivo>;
let cache: { ruta: string; fecha: number; mapa: Mapa } | undefined;

// Considerar ambiguos los puntos a pocos metros del borde, incluido el centro de un geohash.
const limites = new WeakMap<Punto[], [number, number, number, number]>();
function dentro(p: Punto, ring: Punto[]): boolean | null {
  let bbox = limites.get(ring);
  if (!bbox) {
    bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of ring) {
      bbox[0] = Math.min(bbox[0], x);
      bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x);
      bbox[3] = Math.max(bbox[3], y);
    }
    limites.set(ring, bbox);
  }
  const margen = 0.00006;
  if (
    p[0] < bbox[0] - margen ||
    p[1] < bbox[1] - margen ||
    p[0] > bbox[2] + margen ||
    p[1] > bbox[3] + margen
  )
    return false;
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i]!,
      [a, b] = ring[j]!,
      dx = a - x,
      dy = b - y;
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy || 1)),
    );
    if (Math.hypot(p[0] - x - t * dx, p[1] - y - t * dy) < margen) return null;
    if (y > p[1] !== b > p[1] && p[0] < ((a - x) * (p[1] - y)) / (b - y) + x) dentro = !dentro;
  }
  return dentro;
}
export function codigoDelPunto(p: Punto, mapa: Mapa): string | null {
  const zonas = new Set<string>();
  for (const f of mapa.features) {
    for (const pol of f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates) {
      const exterior = dentro(p, pol[0]!);
      if (exterior === null) return null;
      if (!exterior) continue;
      const huecos = pol.slice(1).map((r) => dentro(p, r));
      if (huecos.includes(null)) return null;
      if (!huecos.includes(true)) zonas.add(f.properties.codigo);
    }
  }
  return zonas.size === 1 ? [...zonas][0]! : null;
}
export async function distritoDelEnlace(url: string) {
  const ruta = process.env.SHIPPING_CR_DISTRICTS_FILE;
  if (!ruta) return null;
  const punto = await puntoDeEnlace(url);
  if (!punto) return null;
  const { mtimeMs } = await stat(ruta);
  if (cache?.ruta !== ruta || cache.fecha !== mtimeMs) {
    cache = { ruta, fecha: mtimeMs, mapa: archivo.parse(JSON.parse(await readFile(ruta, "utf8"))) };
  }
  return codigoDelPunto(punto, cache.mapa);
}
