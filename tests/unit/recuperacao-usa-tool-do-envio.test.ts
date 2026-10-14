import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runModelCall, tool } from "@/lib/agent-engine/edge/llm/run-model-call";

describe("recuperação chega ao provider como chamada obrigatória da ferramenta", () => {
  it("exige send_message, executa a tool e preserva o teto", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("settings->'llm'"))
        return {
          rows: [
            {
              llm: {
                provider: "openai",
                default_model: "modelo-teste",
                enabled_models: [],
                params: {},
              },
            },
          ],
        };
      return { rows: [] };
    });
    const generate = vi.fn(async (_options: Record<string, unknown>) => ({
      content: [
        {
          type: "tool-call",
          toolCallId: "send-1",
          toolName: "send_message",
          input: JSON.stringify({ body: "Temos o produto consultado." }),
        },
      ],
      finishReason: { unified: "tool-calls", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }));
    const enviar = vi.fn(async () => ({ ok: true }));
    await runModelCall(
      { query } as never,
      { openaiApiKey: "chave-falsa" },
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        purpose: "agent_turn",
        messages: [{ role: "user", content: "Tem esse produto?" }],
        tools: {
          send_message: tool({ inputSchema: z.object({ body: z.string() }), execute: enviar }),
        },
        toolChoice: { type: "tool", toolName: "send_message" },
        maxSteps: 1,
        maxOutputTokens: 800,
      },
      {
        registry: {
          openai: () =>
            ({
              specificationVersion: "v3",
              provider: "openai",
              modelId: "modelo-teste",
              doGenerate: generate,
            }) as never,
        },
      },
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      toolChoice: { type: "tool", toolName: "send_message" },
      maxOutputTokens: 800,
    });
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
