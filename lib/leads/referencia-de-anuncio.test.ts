import { describe, expect, it } from "vitest";
import { normalizarReferenciaDeAnuncio } from "./referencia-de-anuncio";

describe("normalizarReferenciaDeAnuncio", () => {
  it("lee los campos ctwa_* que llegan con metadata.ad", () => {
    expect(
      normalizarReferenciaDeAnuncio({
        ctwa_source_type: "ad",
        ctwa_source_id: "ad-123",
        ctwa_source_url: "https://fb.me/ad-123",
        ctwa_headline: "Set de cabello 3 en 1",
        ctwa_body: "Consulta los detalles en tu teléfono",
        ctwa_image_url: "https://cdn.example/ad.jpg",
      }),
    ).toEqual({
      titulo: "Set de cabello 3 en 1",
      texto: "Consulta los detalles en tu teléfono",
      url: "https://fb.me/ad-123",
      imagenUrl: "https://cdn.example/ad.jpg",
    });
  });

  it("lee imageurl y la foto anidada que entrega Zernio", () => {
    expect(normalizarReferenciaDeAnuncio({
      source_type: "ad",
      source_url: "https://fb.me/ad",
      imageurl: "https://cdn.example/ad.jpg",
      adscontextdata: { photo_url: "https://cdn.example/nested.jpg", adtitle: "Anuncio" },
    })).toEqual({ titulo: "Anuncio", texto: null, url: "https://fb.me/ad", imagenUrl: "https://cdn.example/ad.jpg" });
    expect(normalizarReferenciaDeAnuncio({
      source_type: "ad", source_url: "https://fb.me/ad", ads_context_data: { photo_url: "https://cdn.example/nested.jpg" },
    })?.imagenUrl).toBe("https://cdn.example/nested.jpg");
  });

  it("no convierte publicaciones orgánicas en tarjetas de anuncio", () => {
    expect(
      normalizarReferenciaDeAnuncio({
        source_type: "post",
        headline: "Publicación compartida",
        image_url: "https://cdn.example/post.jpg",
      }),
    ).toBeNull();
  });
});
