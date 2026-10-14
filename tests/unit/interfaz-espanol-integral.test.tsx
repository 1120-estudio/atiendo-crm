// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import React from "react";
import { render, screen } from "@testing-library/react";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { EvolutionGaps, boaNoticia, montaLacunas } from "@/components/ai/EvolutionGaps";
import { DICIONARIO, traduzir } from "@/lib/i18n/dicionario";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { avisoDeEventoMorto, IA_QUE_NAO_RESPONDEU } from "@/lib/event-log/aviso-de-evento-morto";
import { localizarBriefing } from "@/lib/escalacao/localizar-briefing";
import { formatFaqChunk, parseFaqMarkdown } from "@/lib/ai/rag/ingest/faq";
import { razaoDeContraste } from "@/lib/branding/contraste";
import { arquivosDeCodigo, caminhoRelativo } from "./helpers/varrer-codigo";

const t = (texto: string) => traduzir(texto, "es");

describe("el español alcanza los mensajes del servidor", () => {
  it("todos los fail literales de las rutas usadas por la interfaz tienen traducción", () => {
    const arquivos = arquivosDeCodigo([
      "app/api/v1",
      "lib/auth",
      "lib/impersonate",
      "lib/voice",
      "lib/ai/skills",
    ]).filter((f) => !/\/(cron|webhooks|system\/relogio)\//.test(f));
    const sem: string[] = [];
    const encontrados: string[] = [];
    for (const arquivo of arquivos) {
      const fonte = ts.createSourceFile(
        arquivo,
        readFileSync(arquivo, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visita = (no: ts.Node): void => {
        if (ts.isCallExpression(no) && no.expression.getText(fonte) === "fail") {
          const mensagem = no.arguments[1];
          if (
            mensagem &&
            (ts.isStringLiteral(mensagem) || ts.isNoSubstitutionTemplateLiteral(mensagem)) &&
            /\s/.test(mensagem.text)
          ) {
            encontrados.push(mensagem.text);
            if (!DICIONARIO[mensagem.text]?.es)
              sem.push(`${caminhoRelativo(arquivo)} → ${mensagem.text}`);
          }
          if (
            mensagem &&
            ts.isTemplateExpression(mensagem) &&
            !mensagem.getText(fonte).includes("t(")
          ) {
            const modelo =
              mensagem.head.text +
              mensagem.templateSpans
                .map((parte, indice) => `{valor${indice + 1}}${parte.literal.text}`)
                .join("");
            if (!DICIONARIO[modelo]?.es) sem.push(`${caminhoRelativo(arquivo)} → ${modelo}`);
          }
        }
        ts.forEachChild(no, visita);
      };
      visita(fonte);
    }
    expect(arquivos.length).toBeGreaterThan(200);
    expect(encontrados).toContain("Erro ao salvar o produto.");
    expect(sem).toEqual([]);
  });

  it("traduce avisos automáticos sin modificar el diagnóstico técnico", () => {
    const diagnostico = "insert ou update na tabela: erro original";
    const aviso = avisoDeEventoMorto({
      eventType: "agent.dispatch_requested",
      tentativas: 5,
      motivo: diagnostico,
      efeito: IA_QUE_NAO_RESPONDEU,
    });
    expect(t(aviso.title)).toBe("La IA no pudo responder un mensaje de un cliente");
    expect(t(aviso.body)).toContain("Un cliente escribió y la IA no respondió");
    expect(t(aviso.body)).toContain("5 intentos");
    expect(t(aviso.body)).toContain(diagnostico);
  });

  it("traduce errores interpolados conservando el nombre literal", () => {
    const nome = "Máquina ${literal} {valor1}";
    const texto = `Já existe um material chamado "${nome}". Escolha outro nome.`;
    expect(t(texto)).toBe(`Ya existe un material llamado «${nome}». Elige otro nombre.`);
    expect(traduzir(texto, "pt-BR")).toBe(texto);
    expect(t("Texto libre del cliente, no es una clave")).toBe(
      "Texto libre del cliente, no es una clave",
    );
  });
});

describe("resúmenes y ejemplos en español", () => {
  it("traduce los encabezados de una transferencia existente sin cambiar citas ni datos", () => {
    const texto =
      'Por que a IA passou: O cliente pediu para falar com uma pessoa\nQuem passou escreveu: "Não posso pagar hoje"\nPróxima ação: Verificar SF1219\nÚltimas mensagens do cliente (palavras dele): "Quero 2"';
    expect(localizarBriefing(texto, "es")).toContain(
      'Quien hizo la transferencia escribió: "Não posso pagar hoje"',
    );
    expect(localizarBriefing(texto, "es")).toContain("Próxima acción: Verificar SF1219");
    expect(localizarBriefing(texto, "es")).toContain(
      'Últimos mensajes del cliente (sus palabras): "Quero 2"',
    );
    expect(localizarBriefing(texto, "pt-BR")).toBe(texto);
  });

  it("el parser acepta el ejemplo español y conserva los formatos portugueses anteriores", () => {
    const es = parseFaqMarkdown("## Pregunta: ¿Cuánto cuesta?\n## Respuesta: ₡24.950");
    expect(es).toHaveLength(1);
    expect(es[0]?.question).toBe("¿Cuánto cuesta?");
    expect(es[0]?.answer).toBe("₡24.950");
    expect(es[0]?.locale).toBe("es");
    expect(formatFaqChunk(es[0]!)).toBe("Pregunta: ¿Cuánto cuesta?\nRespuesta: ₡24.950");
    expect(
      parseFaqMarkdown("---\nlocale: pt-BR\n---\n## Pregunta: Precio?\n## Respuesta: 10")[0]
        ?.locale,
    ).toBe("pt-BR");
    expect(parseFaqMarkdown("## Pergunta: Preço?\n## Resposta: 10")).toHaveLength(1);
    expect(parseFaqMarkdown("## P: Preço?\n## R: 10")).toHaveLength(1);
  });

  it("el panel de evolución renderiza español, incluso en estados sin actividad", () => {
    const gaps = {
      knowledge_empty: 0,
      knowledge_near_misses: 0,
      router_no_match: 0,
      router_failed: 0,
      unmapped_agent_steps: [],
      pipelines_evaluated: 0,
    };
    render(
      <IdiomaProvider locale="es">
        <EvolutionGaps gaps={gaps} buscas={0} decisoes={0} />
      </IdiomaProvider>,
    );
    expect(screen.getByTestId("gaps-vazio")).toHaveTextContent("Todavía no se puede determinar");
    expect(boaNoticia(1, 1, 1, t)).toContain("Sin bloqueos detectados");
    const lacunas = montaLacunas(
      {
        ...gaps,
        knowledge_empty: 2,
        router_failed: 1,
        unmapped_agent_steps: [{ pipeline_name: "Multitiendas", steps: ["won"] }],
      },
      t,
    );
    expect(lacunas[0]?.texto).toContain("Multitiendas");
    expect(lacunas.map((l) => l.texto).join(" ")).not.toMatch(
      /\b(não|atendimento|seu|você|funil|conversa)\b/,
    );
  });
});

describe("paleta aprobada y contraste", () => {
  it("mantiene legibilidad de textos y de la selección azul sobre las superficies oscuras", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const escuro = css.slice(css.indexOf('\n[data-theme="dark"] {')).split("\n}")[0]!;
    const hex = (token: string) => {
      const valor = new RegExp(token + ":\\s*(#[a-f0-9]{6});", "i").exec(escuro)?.[1];
      expect(valor, token).toBeDefined();
      return valor!;
    };
    expect(hex("--color-bg")).toBe("#111827");
    expect(hex("--color-shell")).toBe("#171f2d");
    for (const fundo of [
      "--color-bg",
      "--color-surface",
      "--color-surface-elevated",
      "--color-shell",
    ])
      for (const frente of ["--color-text", "--color-text-muted", "--color-text-subtle"])
        expect(
          razaoDeContraste(hex(frente), hex(fundo)),
          `${frente} sobre ${fundo}`,
        ).toBeGreaterThanOrEqual(4.5);
    expect(
      razaoDeContraste(hex("--color-navigation-fg"), hex("--color-navigation-active")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
