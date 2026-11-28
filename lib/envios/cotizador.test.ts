import { describe, expect, it, vi } from "vitest";
import { cotizar, leerTarifas, type Producto } from "./cotizador";
import { codigoDelPunto, puntoDeEnlace } from "./ubicacion";

const tarifa = (codigo: string, canton: string) =>
  `Provincia: Provincia A; cantón: ${canton}; distrito: Centro; código: ${codigo}. PEQUEÑO: ₡1.000, PROPIA, plazo 1 a 2 días hábiles; MEDIANO: ₡2.000, PROPIA, plazo 1 a 2 días hábiles; GRANDE: ₡5.000, EXTERNA, plazo 3 días hábiles.`;
const tabla = leerTarifas([tarifa("11111", "Uno"), tarifa("11111", "Uno"), tarifa("22222", "Dos")]);
const producto = (codigo: string, tamano: string): Producto => ({
  codigo,
  nome: codigo,
  descricao: "📦 Paquete: " + tamano,
  preco_cents: 105025,
  moeda: "CRC",
  controla_estoque: false,
  quantidade: null,
  woo_disponivel: true,
});
const productos = [producto("A", "pequeño"), producto("B", "grande"), producto("C", "mediano")];
const pedido = (...codigos: string[]) => codigos.map((codigo) => ({ codigo, cantidad: 1 }));
const zona = { distrito: "centro", canton: "Uno" };
describe("cotización con importes sintéticos", () => {
  it("cobra una vez por tamaño mayor y conserva céntimos", () =>
    expect(cotizar(pedido("A", "C"), productos, zona, tabla)).toMatchObject({
      total_crc: 4100.5,
      envios: 1,
      envio_crc: 2000,
      modalidad: "contraentrega_disponible",
    }));
  it("cuenta unidades grandes, también cuando están en líneas distintas", () =>
    expect(cotizar(pedido("B", "A", "B"), productos, zona, tabla)).toMatchObject({
      envio_crc: 10000,
      envios: 2,
      total_crc: 13150.75,
      modalidad: "pago_anticipado",
    }));
  it("recalcula si cambia la cantidad", () =>
    expect(cotizar([{ codigo: "B", cantidad: 2 }], productos, zona, tabla)).toMatchObject({
      envios: 2,
      total_crc: 12100.5,
    }));
  it("pide sólo aclarar un distrito homónimo", () =>
    expect(cotizar(pedido("A"), productos, { distrito: "Centro" }, tabla)).toMatchObject({
      estado: "aclarar_destino",
    }));
  it("mantiene pendientes destinos sin tarifa o tamaño", () => {
    expect(cotizar(pedido("A"), productos, { codigo: "33333" }, tabla)).toMatchObject({
      estado: "revision_interna",
    });
    expect(cotizar(pedido("A"), [producto("A", "sin etiqueta")], zona, tabla)).toMatchObject({
      estado: "revision_interna",
    });
  });
  it("detecta tarifas incompatibles", () =>
    expect(() =>
      leerTarifas([tarifa("11111", "Uno"), tarifa("11111", "Uno").replace("₡5.000", "₡6.000")]),
    ).toThrow());
  it("suma stock necesario antes de cotizar", () =>
    expect(
      cotizar(
        pedido("A", "A"),
        [{ ...productos[0]!, controla_estoque: true, quantidade: 1 }],
        zona,
        tabla,
      ),
    ).toMatchObject({ estado: "revision_interna" }));
});
describe("destino", () => {
  it("lee pines de WhatsApp y Waze con coordenadas", async () => {
    for (const u of [
      "https://maps.google.com/?q=9.93,-84.08",
      "https://waze.com/ul?ll=9.93,-84.08",
      "https://waze.com/live-map?to=ll.9.93,-84.08",
    ])
      expect(await puntoDeEnlace(u)).toEqual([-84.08, 9.93]);
    expect(await puntoDeEnlace("https://waze.com/ul/hd1u0w9u25")).toHaveLength(2);
  });
  it("rechaza rutas y centros de cámara", async () => {
    for (const u of [
      "https://www.google.com/maps/dir/A/B",
      "https://www.google.com/maps/@9.93,-84.08,17z",
      "https://otro.test/?q=9.93,-84.08",
    ])
      expect(await puntoDeEnlace(u)).toBeNull();
  });
  it("sigue un enlace corto sólo hasta un marcador admitido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: "https://maps.google.com/?q=9.93,-84.08" },
        }),
      ),
    );
    try {
      expect(await puntoDeEnlace("https://maps.app.goo.gl/ejemplo")).toEqual([-84.08, 9.93]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("excluye huecos y bordes", () => {
    const r = (v: number, w: number): [number, number][] => [
      [v, v],
      [v, w],
      [w, w],
      [w, v],
      [v, v],
    ];
    const mapa = {
      type: "FeatureCollection" as const,
      features: [
        {
          properties: { codigo: "11111" },
          geometry: { type: "Polygon" as const, coordinates: [r(0, 10), r(4, 6)] },
        },
      ],
    };
    expect(codigoDelPunto([2, 2], mapa)).toBe("11111");
    expect(codigoDelPunto([5, 5], mapa)).toBeNull();
    expect(codigoDelPunto([0, 2], mapa)).toBeNull();
  });
});
