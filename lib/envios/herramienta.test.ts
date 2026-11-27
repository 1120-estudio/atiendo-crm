import { describe, expect, it } from "vitest";
import { crmCotizarEnvio } from "@/lib/mcp/tools/cotizar-envio";
import type { McpContext } from "@/lib/mcp/types";

function banco(org: string) {
  const consultas: { tabla: string; filtros: Record<string, unknown> }[] = [];
  const tablas: Record<string, unknown> = {
    ai_knowledge_sources: {
      id: "fuente",
      active_kb_version_id: "v-test",
      chunks_count: 1,
      last_index_status: "success",
    },
    ai_chunks: [
      {
        content:
          "Provincia: Ejemplo; cantón: Uno; distrito: Centro; código: 12345. GRANDE: ₡3.500, EXTERNA, plazo 2 a 3 días hábiles.",
      },
    ],
    catalog_products: [
      {
        codigo: "X",
        nome: "Prueba",
        descricao: "Paquete: grande",
        preco_cents: 100000,
        moeda: "CRC",
        controla_estoque: false,
        woo_disponivel: true,
      },
    ],
  };
  const db = {
    from: (tabla: string) => {
      const filtros: Record<string, unknown> = {};
      consultas.push({ tabla, filtros });
      const respuesta = () => Promise.resolve({ data: tablas[tabla], error: null });
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filtros[k] = v;
          return q;
        },
        order: () => q,
        range: respuesta,
        maybeSingle: respuesta,
        in: respuesta,
      };
      return q;
    },
  };
  return { ctx: { organizationId: org, supabase: db } as unknown as McpContext, consultas, tablas };
}
describe("herramienta que utiliza el agente", () => {
  it("usa la versión activa de la organización y devuelve dos fletes grandes", async () => {
    const b = banco("organizacion-prueba");
    const r = await crmCotizarEnvio.handler(
      { productos: [{ codigo: "X", cantidad: 2 }], distrito: "Centro" },
      b.ctx,
    );
    expect(r).toMatchObject({
      estado: "cotizado",
      envios: 2,
      envio_crc: 7000,
      total_crc: 9000,
      version_tarifario: "v-test",
    });
    expect(b.consultas.every((c) => c.filtros.organization_id === "organizacion-prueba")).toBe(
      true,
    );
    expect(b.consultas.find((c) => c.tabla === "ai_chunks")?.filtros.kb_version_id).toBe("v-test");
  });
  it("no da precio con un índice parcial", async () => {
    const b = banco("otra-org");
    b.tablas.ai_chunks = [];
    expect(
      await crmCotizarEnvio.handler(
        { productos: [{ codigo: "X", cantidad: 2 }], distrito: "Centro" },
        b.ctx,
      ),
    ).toMatchObject({ estado: "revision_interna" });
  });
  it("no registra la ubicación del cliente en los argumentos de auditoría", () => {
    expect(
      crmCotizarEnvio.redigirParaAuditoria?.({
        productos: [],
        enlace: "privado",
        distrito: "privado",
      }),
    ).toEqual({ lineas: 0, con_enlace: true });
  });
});
