import type { FlowGraph } from "@/lib/followup/graph-schema";

/** Localiza solo un grafo de fábrica, antes de guardarlo como borrador. */
export function localizarGrafoDeModelo(grafo: FlowGraph, t: (texto: string) => string): FlowGraph {
  const copia = structuredClone(grafo);
  for (const node of copia.nodes) {
    if (node.label) node.label = t(node.label);
    if (node.type === "action" && node.config.mode === "text")
      node.config.body = t(node.config.body);
    if (node.type === "match_reply") {
      for (const branch of node.config.branches) {
        branch.label = t(branch.label);
        branch.pattern = t(branch.pattern);
      }
    }
    if (node.type === "end" && node.config.note) node.config.note = t(node.config.note);
  }
  return copia;
}
