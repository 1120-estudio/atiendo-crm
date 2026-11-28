export const tamanos = ["pequeño", "mediano", "grande"] as const;
type Tamano = (typeof tamanos)[number];
export type Destino = { provincia?: string; canton?: string; distrito?: string; codigo?: string };
type Tarifa = { colones: number; cobertura: "PROPIA" | "EXTERNA"; plazo: string };
type Zona = Required<Destino> & { tarifas: Partial<Record<Tamano, Tarifa>> };
export type Producto = {
  codigo: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  moeda: string;
  controla_estoque: boolean;
  quantidade: number | null;
  woo_disponivel: boolean | null;
};
export type Item = { codigo: string; cantidad: number };
const normal = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const revision = (motivo: string) => ({ estado: "revision_interna", motivo }) as const;

export function leerTarifas(fragmentos: string[]): Zona[] {
  const zonas = new Map<string, Zona>();
  for (const texto of fragmentos) {
    // El indexador solapa los fragmentos. Sólo se leen registros con cabecera completa.
    for (const parte of texto.split(/(?=Provincia\s*:)/i)) {
      const cab =
        /^Provincia:\s*([^;]+);\s*cantón:\s*([^;]+);\s*distrito:\s*([^;]+);\s*código:\s*(\d{5})\./i.exec(
          parte,
        );
      if (!cab) continue;
      const [, provincia, canton, distrito, codigo] = cab;
      if (!provincia || !canton || !distrito || !codigo) continue;
      const zona =
        zonas.get(codigo) ??
        ({
          provincia: provincia.trim(),
          canton: canton.trim(),
          distrito: distrito.trim(),
          codigo,
          tarifas: {},
        } as Zona);
      if (
        [provincia, canton, distrito].map(normal).join("|") !==
        [zona.provincia, zona.canton, zona.distrito].map(normal).join("|")
      )
        throw new Error("tarifario_en_conflicto");
      for (const m of parte
        .slice(cab[0].length)
        .matchAll(
          /(PEQUEÑO|MEDIANO|GRANDE):\s*₡\s*((?:\d{1,3}(?:\.\d{3})+|\d+)),\s*(PROPIA|EXTERNA),\s*plazo\s+(\d+(?:\s+a\s+\d+)?\s+d[ií]as?\s+h[aá]biles?)\b/gi,
        )) {
        const tam = m[1]!.toLowerCase() as Tamano;
        const tarifa = {
          colones: Number(m[2]!.replaceAll(".", "")),
          cobertura: m[3]!.toUpperCase() as Tarifa["cobertura"],
          plazo: m[4]!.trim(),
        };
        if (
          !Number.isSafeInteger(tarifa.colones) ||
          (zona.tarifas[tam] && JSON.stringify(zona.tarifas[tam]) !== JSON.stringify(tarifa))
        )
          throw new Error("tarifario_en_conflicto");
        zona.tarifas[tam] = tarifa;
      }
      zonas.set(codigo, zona);
    }
  }
  return [...zonas.values()];
}

export function cotizar(items: Item[], productos: Producto[], destino: Destino, zonas: Zona[]) {
  if (!destino.codigo && !destino.distrito) return { estado: "preguntar_distrito" };
  const matches = zonas.filter((z) =>
    (["codigo", "distrito", "canton", "provincia"] as const).every(
      (k) => !destino[k] || normal(z[k]) === normal(destino[k]!),
    ),
  );
  if (matches.length > 1)
    return {
      estado: "aclarar_destino",
      opciones: matches.map(({ provincia, canton, distrito }) => ({ provincia, canton, distrito })),
    };
  const zona = matches[0];
  if (!zona) return revision("destino_sin_tarifa_verificada");
  const cantidades = new Map<string, number>();
  for (const i of items) cantidades.set(i.codigo, (cantidades.get(i.codigo) ?? 0) + i.cantidad);
  let mayor = 0,
    grandes = 0,
    subtotal = 0;
  const lineas = [];
  for (const [codigo, cantidad] of cantidades) {
    const p = productos.find((p) => p.codigo === codigo);
    if (
      !p ||
      p.moeda !== "CRC" ||
      !Number.isSafeInteger(p.preco_cents) ||
      p.preco_cents <= 0 ||
      p.woo_disponivel === false ||
      (p.controla_estoque && (p.quantidade ?? 0) < cantidad)
    )
      return revision("verificar_producto_precio_o_stock");
    const etiquetas = new Set(
      Array.from(
        (p.descricao ?? "").matchAll(/\bPaquete\s*:\s*(pequeño|mediano|grande)\b/gi),
        (m) => m[1]!.toLowerCase() as Tamano,
      ),
    );
    const [tam] = etiquetas;
    if (!tam || etiquetas.size !== 1) return revision("verificar_tamano_de_" + codigo);
    mayor = Math.max(mayor, tamanos.indexOf(tam));
    if (tam === "grande") grandes += cantidad;
    subtotal += p.preco_cents * cantidad;
    lineas.push({
      codigo,
      nombre: p.nome,
      cantidad,
      precio_unitario_crc: p.preco_cents / 100,
      subtotal_crc: (p.preco_cents * cantidad) / 100,
    });
  }
  const tamano = tamanos[mayor]!,
    tarifa = zona.tarifas[tamano];
  if (!tarifa) return revision("tarifa_incompleta");
  const envios = Math.max(grandes, 1),
    envio = envios * tarifa.colones;
  if (!Number.isSafeInteger(subtotal + envio * 100)) return revision("importe_fuera_de_rango");
  return {
    estado: "cotizado",
    destino: {
      codigo: zona.codigo,
      provincia: zona.provincia,
      canton: zona.canton,
      distrito: zona.distrito,
    },
    moneda: "CRC",
    lineas,
    subtotal_crc: subtotal / 100,
    tamano,
    envios,
    tarifa_unitaria_crc: tarifa.colones,
    envio_crc: envio,
    total_crc: (subtotal + envio * 100) / 100,
    cobertura: tarifa.cobertura,
    modalidad: tarifa.cobertura === "PROPIA" ? "contraentrega_disponible" : "pago_anticipado",
    plazo_estimado: tarifa.plazo,
  };
}
