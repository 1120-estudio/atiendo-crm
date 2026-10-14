import { formatValorDoNegocio } from "@/lib/money";
/**
 * LGPD export PDF renderer (PT-BR).
 *
 * Template para Art. 18, II — direito de acesso aos dados. Renderizado para
 * Buffer via @react-pdf/renderer e entregue ao titular via Resend.
 *
 * ── ESTE DOCUMENTO NÃO LEVA MARCA. É decisão, não esquecimento ──────────────
 *
 * O rodapé imprime o CONTROLADOR (`organizations.legal_name`) e o Encarregado
 * resolvido. Não imprime a marca do revendedor, não imprime a nossa, não leva
 * logo e não leva cor.
 *
 * O motivo: o relatório do Art. 18 II responde a um DIREITO LEGAL do titular.
 * Nomear ali o revendedor — que é OPERADOR, não controlador — inverteria os
 * papéis num documento jurídico. Trocar `DeskcommCRM` por `Vendas Turbo CRM`
 * no rodapé não é "completar o white-label": é piorar o defeito, porque hoje o
 * nome é obviamente o do software, e depois passaria a parecer a declaração de
 * quem responde pelos dados.
 *
 * Consequência boa e deliberada: a armadilha do @react-pdf não nos alcança.
 * `var(--x)` e `oklch()` renderizam PDF VÁLIDO e descartam a cor em silêncio
 * (medido: 1514 bytes contra 1538 do hex), então qualquer prova do tipo "gerei
 * o PDF e ele abriu" passaria com a marca perdida. Como o documento não recebe
 * cor de marca nenhuma, o `styles` de módulo abaixo pode continuar de módulo:
 * zero risco assumido. Não parametrize, não mova para dentro do componente.
 *
 * A tela que resolve o outro lado disto é `/app/settings/tenant` (campo "Razão
 * social"): `legal_name` nasce IGUAL a `display_name` no bootstrap
 * (`scripts/bootstrap-owner.ts`, os dois recebem `ORG_NAME`), então o caso ruim
 * aqui não é o campo vazio — é o nome fantasia impresso como razão social. Uma
 * guarda "se vazio, use X" nunca dispararia; o que resolve é preencher a tela.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { idiomaDaInstalacao } from "@/lib/i18n/idiomaDaInstalacao";
import { env } from "@/lib/env";

import type { ExportPayload } from "./export-collector";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1f2937",
  },
  header: {
    borderBottom: "1pt solid #d1d5db",
    paddingBottom: 8,
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#6b7280" },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    backgroundColor: "#f3f4f6",
    padding: 4,
    marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: "#6b7280" },
  value: { flex: 1 },
  small: { fontSize: 8, color: "#9ca3af" },
  itemBlock: {
    marginBottom: 4,
    paddingBottom: 4,
    borderBottom: "0.5pt dashed #e5e7eb",
  },
  warningBanner: {
    marginTop: 14,
    padding: 6,
    border: "1pt solid #f59e0b",
    backgroundColor: "#fffbeb",
    fontSize: 9,
    color: "#92400e",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#9ca3af",
    borderTop: "0.5pt solid #e5e7eb",
    paddingTop: 4,
  },
});

interface Props {
  data: ExportPayload;
  /** When true, appends an unsigned-PADES warning banner. */
  unsignedWarning?: boolean;
}

function fmtDate(s: string | null | undefined, idioma: string, timezone: string): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(idioma, { timeZone: timezone });
  } catch {
    return s;
  }
}

function fmtMoney(cents: number | null | undefined, currency: string | null | undefined): string {
  return cents == null ? "—" : formatValorDoNegocio(cents, currency ?? "BRL");
}

/**
 * A MESMA cadeia que `lib/lgpd/sla-alarm.ts:93` já usa
 * (organização acima, instalação abaixo — resolvida pelo coletor). Reusar a ordem, e não
 * inventar outra, é o que impede o documento e o alarme de apontarem para
 * encarregados diferentes na mesma organização.
 *
 * O texto anterior era `DPO: contato via canal oficial do controlador` — um
 * não-resposta num campo cuja função é dizer a quem o titular reclama.
 */
function encarregado(data: ExportPayload): string {
  // O renderizador não consulta configuração: ele desenha o que recebeu. Quem
  // resolve o encarregado (organização acima, instalação abaixo) é o coletor,
  // que é assíncrono e já busca `dpo_email` da organização. Deixar a busca aqui
  // obrigaria um componente de PDF a falar com o banco no meio do desenho.
  return data.dpo_email || "não informado pelo controlador";
}

// Concluir o processamento do job não comprova envio: ele também pode terminar
// com um bloqueio. O relatório conserva essa diferença, sem anunciar entrega.
const deliveryStatus: Record<string, string> = {
  pending: "Pendente",
  running: "Em processamento",
  done: "Processamento concluído",
  failed: "Falha no processamento",
  dead: "Tentativas encerradas",
};
const noticeStatus: Record<string, string> = {
  open: "Aberto",
  resolved: "Resolvido",
  dismissed: "Dispensado",
};

export function LgpdExportPdf({ data, unsignedWarning }: Props): React.ReactElement {
  const idioma = normalizarIdioma(data.locale ?? idiomaDaInstalacao());
  const t = (texto: string) => traduzir(texto, idioma);
  const dataLegivel = (texto: string | null | undefined) =>
    fmtDate(texto, idioma, data.timezone ?? "UTC");
  const shortId = data.request_id.slice(0, 8);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t("Relatório de Acesso aos Dados")}</Text>
          <Text style={styles.subtitle}>
            {/* A lei vem do PERFIL do país da organização (issue #1033): país
                sem citação revisada não cita lei nenhuma — citar a errada é
                pior do que não citar artigo nenhum. */}
            {t("Base legal:")} {data.lei_citada ?? t("não declarada (país sem citação revisada)")}{" "}
            {t("· Solicitação #")}
            {shortId}
          </Text>
        </View>

        {/* Metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Metadados da Solicitação")}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t("ID:")}</Text>
            <Text style={styles.value}>{data.request_id}</Text>
          </View>
          {/* A razão social vem primeiro e o uuid vira "ID interno": o campo
              existe para o TITULAR saber de quem são os dados, e um uuid cru
              não responde isso a ninguém. O id continua no documento porque é
              o que o suporte pede quando alguém liga citando o relatório. */}
          <View style={styles.row}>
            <Text style={styles.label}>{t("Organização:")}</Text>
            <Text style={styles.value}>{data.organization_legal_name || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t("ID interno:")}</Text>
            <Text style={styles.value}>{data.organization_id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t("Gerado em:")}</Text>
            <Text style={styles.value}>{dataLegivel(data.generated_at)}</Text>
          </View>
          {data.no_local_footprint ? (
            <View style={styles.row}>
              <Text style={styles.label}>{t("Status:")}</Text>
              <Text style={styles.value}>
                {t("Nenhum dado pessoal localizado nos sistemas internos.")}{" "}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Contact */}
        {data.contact ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Dados Pessoais (Contato)")}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>{t("Nome:")}</Text>
              <Text style={styles.value}>{data.contact.name ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t("Email:")}</Text>
              <Text style={styles.value}>{data.contact.email ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t("Telefone:")}</Text>
              <Text style={styles.value}>{data.contact.phone_number ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{data.documento_rotulo}:</Text>
              <Text style={styles.value}>
                {data.contact.cpf_present
                  ? "Armazenado (criptografado)"
                  : data.contact.cpf_informado_na_conversa
                    ? "Informado na conversa (valor no arquivo de dados)"
                    : "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t("Origem:")}</Text>
              <Text style={styles.value}>{data.contact.source ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t("Criado em:")}</Text>
              <Text style={styles.value}>{dataLegivel(data.contact.created_at)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t("Anonimizado:")}</Text>
              <Text style={styles.value}>{data.contact.is_anonymized ? t("Sim") : t("Não")}</Text>
            </View>
          </View>
        ) : null}

        {/* Respostas e campos personalizados (roteiros de atendimento, etc.) */}
        {data.contact && (data.contact.campos_legiveis ?? []).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Respostas e campos personalizados")}</Text>
            {/* A pergunta em linha própria: rótulo de roteiro é frase, e na coluna
                de 110pt dos dados fixos ele quebrava no meio da palavra. */}
            {data.contact.campos_legiveis.map((campo, i) => (
              <View key={i} style={styles.itemBlock}>
                <Text style={styles.small}>{campo.rotulo}</Text>
                <Text>{campo.valor}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Consents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Consentimentos")}</Text>
          {data.consents.length === 0 ? (
            <Text style={styles.small}>{t("Nenhum consentimento registrado.")}</Text>
          ) : (
            data.consents.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{c.scope}:</Text>
                <Text style={styles.value}>
                  {c.granted ? "concedido" : "negado"}
                  {c.granted_at ? ` ${t("em")} ${dataLegivel(c.granted_at)}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Conversations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Histórico de Atendimento")}</Text>
          <Text style={styles.small}>
            {t("Total de conversas:")} {data.conversations.length} {t("· Total de mensagens:")}{" "}
            {data.messages_count_total} {t("· Amostra incluída neste relatório:")}{" "}
            {data.messages_recent.length}
          </Text>
          {data.conversations.slice(0, 10).map((c) => (
            <View key={c.id} style={styles.itemBlock}>
              <Text>
                {t("Conversa #")}
                {c.id.slice(0, 8)} · {c.channel} · {c.status}
              </Text>
              <Text style={styles.small}>
                {t("Última mensagem:")} {dataLegivel(c.last_message_at)} {t("· Criada em")}{" "}
                {dataLegivel(c.created_at)}
              </Text>
            </View>
          ))}
        </View>

        {/* Recent messages preview */}
        {data.messages_recent.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Mensagens Recentes (amostra)")}</Text>
            {data.messages_recent.slice(0, 25).map((m) => (
              <View key={m.id} style={styles.itemBlock}>
                <Text style={styles.small}>
                  {dataLegivel(m.created_at)} · {m.direction} · {m.type} · {m.status}
                </Text>
                <Text>{m.body ? m.body.slice(0, 280) : m.has_media ? "[mídia]" : "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Leads */}
        {data.leads.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Atividade Comercial — Leads")}</Text>
            {data.leads.map((l) => (
              <View key={l.id} style={styles.itemBlock}>
                <Text>
                  {l.title ?? t("(sem título)")} · {l.status} ·{" "}
                  {fmtMoney(l.value_cents, l.currency)}
                </Text>
                <Text style={styles.small}>
                  {t("Criado em")} {dataLegivel(l.created_at)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Orders */}
        {data.orders.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Pedidos")}</Text>
            {data.orders.map((o) => (
              <View key={o.id} style={styles.itemBlock}>
                <Text>
                  {o.external_provider ?? "—"} #{o.external_id ?? o.id.slice(0, 8)} · {o.status} ·{" "}
                  {fmtMoney(o.total_cents, o.currency)}
                </Text>
                <Text style={styles.small}>
                  {t("Pedido em")} {dataLegivel(o.ordered_at)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Agenda — vai no PDF, e não só no JSON, porque é a substância legível
            do Art. 18 II: "houve consulta no dia tal, sobre isto". `activities`
            fica só no JSON de propósito (type/source_module é telemetria); um
            compromisso, não. */}
        {data.appointments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Agenda — Compromissos")}</Text>
            {data.appointments.map((c) => (
              <View key={c.id} style={styles.itemBlock}>
                <Text>
                  {c.title ?? t("(sem título)")} · {c.status}
                  {c.location_details ? ` · ${c.location_details}` : ""}
                </Text>
                <Text style={styles.small}>
                  {dataLegivel(c.starts_at)} {t("até")} {dataLegivel(c.ends_at)} ({c.time_zone})
                </Text>
                {c.description ? <Text style={styles.small}>{c.description}</Text> : null}
                {c.notes ? (
                  <Text style={styles.small}>
                    {t("Anotação:")} {c.notes}
                  </Text>
                ) : null}
                {c.meeting_url ? (
                  <Text style={styles.small}>
                    {t("Link da reunião:")} {c.meeting_url}
                  </Text>
                ) : null}
                {c.cancellation_reason ? (
                  <Text style={styles.small}>
                    {t("Cancelado:")} {c.cancellation_reason}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* O fluxo entrega este PDF; armazenar as categorias só no JSON não
            as disponibiliza ao titular. Consumir apenas a projeção do coletor. */}
        {data.reply_drafts?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Sugestões e respostas revisadas")}</Text>
            {data.reply_drafts.map((reply) => (
              <View key={reply.id} style={styles.itemBlock}>
                <Text>
                  {t("Estado:")} {reply.status}
                </Text>
                {reply.original_body ? (
                  <Text>
                    {t("Sugestão:")} {reply.original_body}
                  </Text>
                ) : null}
                {reply.edited_body && reply.edited_body !== reply.original_body ? (
                  <Text>
                    {t("Edição:")} {reply.edited_body}
                  </Text>
                ) : null}
                {reply.approved_body ? (
                  <Text>
                    {t("Texto aprovado:")} {reply.approved_body}
                  </Text>
                ) : null}
                {reply.feedback ? (
                  <Text>
                    {t("Revisão:")} {JSON.stringify(reply.feedback)}
                  </Text>
                ) : null}
                {Array.isArray(reply.proposals) && reply.proposals.length ? (
                  <Text>
                    {t("Propostas:")} {JSON.stringify(reply.proposals)}
                  </Text>
                ) : null}
                <Text style={styles.small}>
                  {t("Criado em")} {dataLegivel(reply.created_at)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.meeting_deliveries?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Entregas de links de reunião")}</Text>
            {data.meeting_deliveries.map((delivery) => (
              <View key={delivery.id} style={styles.itemBlock}>
                <Text>{t(deliveryStatus[delivery.status] ?? delivery.status)}</Text>
                <Text style={styles.small}>
                  {t("Registro:")} {delivery.id}
                </Text>
                <Text style={styles.small}>
                  {t("Compromisso:")} {delivery.appointment_id ?? t("referência indisponível")}
                </Text>
                <Text style={styles.small}>
                  {t("Criado em")} {dataLegivel(delivery.created_at)} {t("· Programado para")}{" "}
                  {dataLegivel(delivery.run_after)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.appointment_notices?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Avisos sobre compromissos")}</Text>
            {data.appointment_notices.map((notice) => (
              <View key={notice.id} style={styles.itemBlock}>
                <Text>
                  {notice.title} · {t(noticeStatus[notice.status] ?? notice.status)}
                </Text>
                {notice.body ? <Text>{notice.body}</Text> : null}
                <Text style={styles.small}>
                  {t("Registro:")} {notice.id}
                </Text>
                <Text style={styles.small}>
                  {t("Compromisso:")} {notice.ref_id ?? t("referência indisponível")}
                </Text>
                <Text style={styles.small}>
                  {t("Criado em")} {dataLegivel(notice.created_at)}
                  {notice.resolved_at
                    ? ` · ${t("Resolvido em")} ${dataLegivel(notice.resolved_at)}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Captação — de onde a pessoa veio. Entra no PDF porque `remote_ip`,
            `user_agent` e `utm` são dados que a organização guarda A RESPEITO
            dela e que ela raramente imagina que existem. */}
        {data.webhook_captures.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Como seus dados chegaram até nós")}</Text>
            {data.webhook_captures.map((c) => (
              <View key={c.id} style={styles.itemBlock}>
                <Text>
                  {c.source_name ?? t("(origem não identificada)")} · {c.outcome}
                </Text>
                <Text style={styles.small}>
                  {t("Recebido em")} {dataLegivel(c.received_at)}
                  {c.remote_ip ? ` · IP ${c.remote_ip}` : ""}
                </Text>
                {c.user_agent ? (
                  <Text style={styles.small}>
                    {t("Navegador:")} {c.user_agent.slice(0, 160)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Audit */}
        {data.audit_log_extract.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Atividades de Auditoria")}</Text>
            {data.audit_log_extract.slice(0, 50).map((a) => (
              <View key={a.id} style={styles.row}>
                <Text style={styles.label}>{dataLegivel(a.created_at)}</Text>
                <Text style={styles.value}>
                  {a.action}
                  {a.resource_type ? ` · ${a.resource_type}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Unsigned warning */}
        {unsignedWarning ? (
          <View style={styles.warningBanner}>
            <Text>
              {t(
                "ASSINATURA DIGITAL PAdES PENDENTE — chave LGPD_SIGNING_KEY não configurada. A integridade do documento é garantida por hash SHA-256 registrado em log auditável.",
              )}{" "}
            </Text>
          </View>
        ) : null}

        {/* Footer */}
        {/* CONTROLADOR, nunca marca — ver o cabeçalho deste arquivo. */}
        <View style={styles.footer} fixed>
          <Text>
            {t("Controlador:")} {data.organization_legal_name || "—"}{" "}
            {t("· Relatório de Acesso aos Dados")} {data.lei_citada ? ` — ${data.lei_citada}` : ""}{" "}
            {t("· Encarregado (DPO):")} {t(encarregado(data))}{" "}
            {t("· Validade do link de download conforme e-mail recebido")}{" "}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderLgpdPdf(
  data: ExportPayload,
  options: { unsignedWarning?: boolean } = {},
): Promise<Buffer> {
  const element = <LgpdExportPdf data={data} unsignedWarning={options.unsignedWarning} />;
  const buf = await renderToBuffer(element);
  return buf as Buffer;
}
