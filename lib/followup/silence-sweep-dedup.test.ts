import { describe, expect, it, vi } from "vitest";
import { createSupabaseSilenceSweepDb } from "./silence-sweep";

vi.mock("@/lib/atendimento/origem", () => ({ assertServiceBoundarySupabase: vi.fn() }));
vi.mock("@/lib/agenda/protecao-followup", () => ({
  protecaoAgendaSupabase: vi.fn(async () => new Map([["contact", { adiar: false }]])),
}));

function setup() {
  let message = { id: "message-1", sent_at: "2026-09-01T10:00:00.000Z" };
  const records: Array<{ id: string; pointer_id: string; contact_id: string; started_at: string; silence_source_message_id: string }> = [];
  const conversation = () => ({
    id: "conversation", organization_id: "org", contact_id: "contact", status: "open", service_revision: 1,
    current_demanda_id: null, demandas: null, last_inbound_at: message.sent_at,
    contacts: { tags: [], is_blocked: false, ai_authorized_at: null, phone_number: null },
    sessao: { metadata: {} },
    messages: [{ ...message, organization_id: "org", contact_id: "contact", conversation_id: "conversation", service_revision: 1, demanda_id: null, demanda_revision: null }],
  });
  const admin = { from(table: string) {
    const filters: Record<string, string> = {};
    let after = "";
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (key: string, value: string) => { filters[key] = value; return chain; };
    chain.not = () => chain;
    chain.order = () => chain;
    chain.gte = (_key: string, value: string) => { after = value; return chain; };
    chain.limit = () => chain;
    chain.insert = async (value: { pointer_id: string; contact_id: string; silence_source_message_id: string }) => {
      if (records.some((r) => r.pointer_id === value.pointer_id && r.contact_id === value.contact_id && r.silence_source_message_id === value.silence_source_message_id)) return { error: { code: "23505" } };
      records.push({ ...value, id: "enrollment", started_at: "2026-09-01T12:00:00.000Z" });
      return { error: null };
    };
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: table === "conversations" ? [conversation()] : records.filter((r) => r.pointer_id === filters.pointer_id && r.contact_id === filters.contact_id && r.started_at >= after), error: null });
    return chain;
  } };
  return { db: createSupabaseSilenceSweepDb(admin as never), records, setMessage: (id: string, sent_at: string) => { message = { id, sent_at }; } };
}

const enrollment = { organization_id: "org", pointer_id: "flow", version_id: "version", contact_id: "contact", current_node_id: "trigger", next_eval_at: "2026-09-01T12:00:00.000Z", agent_id: null };

describe("origem do silêncio", () => {
  it("não reinscreve a mesma mensagem após um acompanhamento terminal e aceita nova mensagem", async () => {
    const { db, records, setMessage } = setup();
    await db.loadSilentContactIds("org", "2026-09-02T00:00:00.000Z", []);
    expect(await db.insertEnrollment(enrollment)).toEqual({ inserted: true });
    expect(await db.insertEnrollment(enrollment)).toEqual({ inserted: false });
    setMessage("message-2", "2026-09-01T13:00:00.000Z");
    await db.loadSilentContactIds("org", "2026-09-02T00:00:00.000Z", []);
    expect(await db.insertEnrollment(enrollment)).toEqual({ inserted: true });
    expect(records.map((r) => r.silence_source_message_id)).toEqual(["message-1", "message-2"]);
  });
  it("protege também inscrições antigas sem a origem registrada", async () => {
    const { db, records } = setup();
    records.push({ id: "legacy", pointer_id: "flow", contact_id: "contact", started_at: "2026-09-01T11:00:00.000Z", silence_source_message_id: "" });
    await db.loadSilentContactIds("org", "2026-09-02T00:00:00.000Z", []);
    expect(await db.insertEnrollment(enrollment)).toEqual({ inserted: false });
  });
  it("trata uma colisão concorrente como não inserida", async () => {
    const { db, records } = setup();
    await db.loadSilentContactIds("org", "2026-09-02T00:00:00.000Z", []);
    const results = await Promise.all([db.insertEnrollment(enrollment), db.insertEnrollment(enrollment)]);
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(records).toHaveLength(1);
  });
});
