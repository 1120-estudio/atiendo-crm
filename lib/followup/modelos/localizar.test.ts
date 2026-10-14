import { describe, expect, it } from "vitest";
import { traduzir } from "@/lib/i18n/dicionario";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import { MODELOS_DE_FOLLOWUP } from "./index";
import { localizarGrafoDeModelo } from "./localizar";

describe("los borradores de fábrica se instalan en español", () => {
  for (const modelo of MODELOS_DE_FOLLOWUP) {
    it(modelo.id, () => {
      const original = structuredClone(modelo.grafo);
      const es = localizarGrafoDeModelo(modelo.grafo, (texto) => traduzir(texto, "es"));
      expect(modelo.grafo).toEqual(original);
      expect(es.edges).toEqual(original.edges);
      expect(
        es.nodes
          .filter((n) => n.type === "wait")
          .map((n) => ({ id: n.id, type: n.type, position: n.position, config: n.config })),
      ).toEqual(
        original.nodes
          .filter((n) => n.type === "wait")
          .map((n) => ({ id: n.id, type: n.type, position: n.position, config: n.config })),
      );
      expect(es.nodes.map((n) => n.id)).toEqual(original.nodes.map((n) => n.id));
      expect(flowGraphSchema.safeParse(es).success).toBe(true);
      expect(validateFlowForPublish(es).ok).toBe(true);
      for (const node of es.nodes) {
        if (node.type === "action" && node.config.mode === "text") {
          expect(node.config.body).not.toMatch(
            /\b(Oi|você|seu|sua|horário|marcar|por aqui|a gente)\b/,
          );
          const antes = original.nodes.find((n) => n.id === node.id);
          expect(antes?.type).toBe("action");
          if (antes?.type === "action" && antes.config.mode === "text")
            expect(node.config.body).not.toBe(antes.config.body);
        }
        if (node.type === "match_reply") {
          expect(node.config.branches.map((b) => b.pattern)).not.toContain("quero");
          expect(node.config.branches.map((b) => b.pattern)).not.toContain("remarcar");
        }
      }
      expect(localizarGrafoDeModelo(modelo.grafo, (texto) => traduzir(texto, "pt-BR"))).toEqual(
        original,
      );
    });
  }
});
