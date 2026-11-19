import { describe, expect, it } from "vitest";
import { corpoDaMensagem } from "./get-lead-context";

describe("contexto del anuncio", () => {
  it("incluye el producto y el mensaje aunque no se procese la imagen", () => {
    const body = corpoDaMensagem({ type: "text", body: "¿Cuenta con garantía?", media_url: null, media_storage_path: null, media_derived_text: null, metadata: { ad_referral: { titulo: "Plancha Nano Trío 3 en 1", texto: "Precio ₡11.500", url: "https://example.com", imagenUrl: null } } });
    expect(body).toContain("Plancha Nano Trío 3 en 1");
    expect(body).toContain("Precio ₡11.500");
    expect(body).toContain("¿Cuenta con garantía?");
  });
});
