import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
const compose = readFileSync("docker-compose.coolify.yml", "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");
function service(name: string): string {
  const block = compose.match(
    new RegExp("^ {2}" + name + ":\\s*\n([\\s\\S]*?)(?=^ {2}[a-z_-]+:|^volumes:|^networks:)", "m"),
  )?.[1];
  if (!block) throw new Error("serviço ausente: " + name);
  return block;
}
describe("fronteira do compose 1120", () => {
  it("exige a credencial e entrega o webhook global pela rede interna", () => {
    expect(service("app")).toMatch(/WAHA_GLOBAL_WEBHOOK_REQUIRE_SECRET: ['"]true['"]/);
    expect(service("waha")).toContain("WHATSAPP_HOOK_URL: http://app:3000/api/v1/webhooks/waha");
    expect(service("waha")).toContain("X-Waha-Webhook-Secret:${WAHA_HMAC_SECRET}");
    expect(service("waha")).toContain("WHATSAPP_HOOK_HMAC_KEY: ${WAHA_HMAC_SECRET}");
    expect(service("waha")).not.toMatch(/WHATSAPP_HOOK_HMAC:/);
  });
  it("não publica serviços internos nem compila no VPS", () => {
    expect(compose).not.toMatch(/^\s+(ports|build):/m);
    expect(compose).not.toMatch(/network_mode: [\'"]?host/);
  });
  it("permite atualização explícita e mantém defaults imutáveis", () => {
    for (const [name, variable] of [
      ["app", "APP_IMAGE"],
      ["worker", "WORKER_IMAGE"],
      ["scheduler", "SCHEDULER_IMAGE"],
    ] as const) {
      expect(service(name).match(/image: (.+)/)?.[1]).toMatch(
        new RegExp(
          "^\\$\\{" + variable + ":-ghcr\\.io/1120-estudio/[a-z-]+@sha256:[a-f0-9]{64}\\}$",
        ),
      );
    }
  });
  it("permite configurar la espera de mensajes en el worker, con quince segundos por defecto", () => {
    expect(service("worker")).toContain("INBOUND_DEBOUNCE_MS: ${INBOUND_DEBOUNCE_MS:-15000}");
  });
  it("o header secreto não é arquivado e a guarda antecede a consulta", () => {
    const source = readFileSync("app/api/v1/webhooks/waha/route.ts", "utf8");
    expect(source).toContain('if (key.toLowerCase() === "x-waha-webhook-secret") return;');
    const guard = source.search(/if\s*\(\s*!authenticateGlobalWahaWebhook\(/);
    const query = source.indexOf("const admin = createAdminClient()");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(query).toBeGreaterThan(guard);
  });
});
