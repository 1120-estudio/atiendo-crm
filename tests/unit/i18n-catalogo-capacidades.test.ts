import { describe, expect, it } from "vitest";
import { traduzir } from "@/lib/i18n/dicionario";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalogo";
import { FERRAMENTAS_DO_HARNESS } from "@/lib/mcp/tools/ferramentas-do-harness";

describe("catálogo de capacidades en español", () => {
  it("traduce los textos del catálogo que se muestran en el selector", () => {
    for (const tool of TOOL_CATALOG) {
      for (const campo of ["rotulo", "explicacao", "oQueToca"] as const) {
        expect(traduzir(tool[campo], "es"), `${tool.name}: ${campo}`).not.toBe(tool[campo]);
      }
    }
  });

  it("traduce las explicaciones de las capacidades automáticas", () => {
    for (const tool of FERRAMENTAS_DO_HARNESS) {
      expect(traduzir(tool.motivo, "es"), tool.id).not.toBe(tool.motivo);
    }
  });
});
