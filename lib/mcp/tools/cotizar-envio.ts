import { z } from "zod";
import type { McpToolDefinition } from "../types";
import { cotizar, leerTarifas } from "@/lib/envios/cotizador";
import { distritoDelEnlace } from "@/lib/envios/ubicacion";

const nombre = z.string().trim().min(1).max(100);
const entrada = {
  productos: z
    .array(z.object({ codigo: nombre, cantidad: z.number().int().min(1).max(999) }))
    .min(1)
    .max(50),
  distrito: nombre.optional(),
  canton: nombre.optional(),
  provincia: nombre.optional(),
  enlace: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .describe("Pin de WhatsApp o enlace original de Google Maps o Waze enviado por el cliente."),
};
// Una versión del índice es inmutable. Sólo se retienen las últimas ocho por proceso.
const porVersion = new Map<string, ReturnType<typeof leerTarifas>>();

function guardarTarifas(clave: string, zonas: ReturnType<typeof leerTarifas>) {
  if (porVersion.size >= 8) porVersion.delete(porVersion.keys().next().value!);
  porVersion.set(clave, zonas);
}

export const crmCotizarEnvio: McpToolDefinition<typeof entrada> = {
  name: "crm_quote_shipping_cr",
  description:
    "Cotiza en CRC un pedido a un destino con los códigos exactos del catálogo, cantidades y el destino indicado por el cliente. Conserva la versión de tarifa y el desglose en el resumen del pedido. Si pide aclaración, pregunta sólo el dato que falta. Ante revisión interna, pide apoyo al responsable; nunca estimes importes.",
  inputSchema: entrada,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  redigirParaAuditoria: (args) => ({
    lineas: Array.isArray(args.productos) ? args.productos.length : 0,
    con_enlace: Boolean(args.enlace),
  }),
  handler: async (input, ctx) => {
    const db = ctx.supabase,
      org = ctx.organizationId;
    let codigo: string | null = null;
    if (input.enlace) {
      try {
        codigo = await distritoDelEnlace(input.enlace);
      } catch {
        /* Solicitar únicamente el distrito si no se puede resolver el pin. */
      }
    }
    if (!codigo && !input.distrito) return { estado: "preguntar_distrito" };
    const source = await db
      .from("ai_knowledge_sources")
      .select("id,active_kb_version_id,chunks_count,last_index_status")
      .eq("organization_id", org)
      .eq("is_active", true)
      .eq("name", "Tarifas de envíos por destino — nueva versión")
      .maybeSingle();
    if (source.error) throw new Error("error_leyendo_tarifario");
    const version = source.data?.active_kb_version_id;
    if (!version || source.data?.last_index_status !== "success")
      return { estado: "revision_interna", motivo: "tarifario_no_preparado" };
    const clave = [org, source.data!.id, version].join("/");
    let zonas = porVersion.get(clave);
    if (!zonas) {
      const textos: string[] = [];
      for (let desde = 0; ; desde = textos.length) {
        const bloque = await db
          .from("ai_chunks")
          .select("content")
          .eq("organization_id", org)
          .eq("knowledge_source_id", source.data!.id)
          .eq("kb_version_id", version)
          .order("position")
          .order("id")
          .range(desde, desde + 499);
        if (bloque.error) throw new Error("error_leyendo_tarifas");
        if (!bloque.data?.length) break;
        textos.push(...bloque.data.map((r) => r.content));
        if (textos.length >= source.data!.chunks_count) break;
      }
      if (!textos.length || textos.length !== source.data!.chunks_count)
        return { estado: "revision_interna", motivo: "tarifario_incompleto" };
      try {
        zonas = leerTarifas(textos);
      } catch {
        return { estado: "revision_interna", motivo: "tarifario_en_conflicto" };
      }
      guardarTarifas(clave, zonas);
    }
    const productos = await db
      .from("catalog_products")
      .select("codigo,nome,descricao,preco_cents,moeda,controla_estoque,quantidade,woo_disponivel")
      .eq("organization_id", org)
      .eq("ativo", true)
      .in(
        "codigo",
        input.productos.map((p) => p.codigo),
      );
    if (productos.error) throw new Error("error_leyendo_catalogo");
    return {
      ...cotizar(
        input.productos,
        productos.data ?? [],
        {
          codigo: codigo ?? undefined,
          distrito: input.distrito,
          canton: input.canton,
          provincia: input.provincia,
        },
        zonas,
      ),
      version_tarifario: version,
    };
  },
};
