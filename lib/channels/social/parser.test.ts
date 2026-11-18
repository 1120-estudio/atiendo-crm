import { describe, expect, it } from "vitest";
import { parseSocialMessage } from "./parser";
const event = {
  event: "message.received",
  account: { id: "account-a", platform: "instagram" },
  message: {
    id: "m1",
    conversationId: "thread",
    platform: "instagram",
    direction: "incoming",
    text: "Oi",
    sender: { id: "123456789012345", name: "Pessoa" },
  },
};
describe("native social identity", () => {
  it("keeps a numeric social ID distinct from a telephone", () => {
    const result = parseSocialMessage(event, "account-a", "instagram");
    expect(result?.participantId).toBe("123456789012345");
    expect(result?.identity.phone).toBeNull();
    expect(result?.externalId).toBe("social:account-a:m1");
  });
  it("rejects another account or network and unsupported inboxes", () => {
    expect(parseSocialMessage(event, "account-b", "instagram")).toBeNull();
    expect(parseSocialMessage(event, "account-a", "facebook")).toBeNull();
    expect(parseSocialMessage(event, "account-a", "linkedin")).toBeNull();
  });
  it("does not turn malformed input or an outgoing echo into inbound", () => {
    expect(parseSocialMessage({}, "account-a", "instagram")).toBeNull();
    expect(
      parseSocialMessage(
        { ...event, message: { ...event.message, direction: "outgoing" } },
        "account-a",
        "instagram",
      ),
    ).toBeNull();
  });
  it("resolves outbound identity from the participant, not the business sender", () => {
    const result = parseSocialMessage(
      {
        ...event,
        event: "message.sent",
        conversation: { participantId: "customer" },
        message: { ...event.message, direction: "outgoing", sender: { id: "business" } },
      },
      "account-a",
      "instagram",
    );
    expect(result?.participantId).toBe("customer");
    expect(result?.direction).toBe("outbound");
  });

  it("conserves metadata de shares de Instagram para clasificar la vista previa", () => {
    const result = parseSocialMessage(
      {
        ...event,
        message: {
          ...event.message,
          attachments: [{
            type: "unsupported_type",
            originalType: "unsupported_type",
            mimeType: "image/jpeg",
            url: "https://cdn.example/shared.jpg",
            previewUrl: "https://cdn.example/preview.jpg",
          }],
        },
      },
      "account-a",
      "instagram",
    );
    expect(result?.attachments[0]).toMatchObject({
      type: "unsupported_type",
      originalType: "unsupported_type",
      mimeType: "image/jpeg",
      previewUrl: "https://cdn.example/preview.jpg",
    });
  });
});
