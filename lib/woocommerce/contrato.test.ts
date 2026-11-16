import { describe, expect, it } from "vitest";
import { centavosWoo, conexaoSchema, mapearProduto, produtoWooSchema, textoWoo } from "./contrato";
const produto = (extra = {}) => produtoWooSchema.parse({ id: 12, name: "Foco", sku: "SF1219", price: "19950", ...extra });
describe("WooCommerce catalogue contract", () => {
  it("converts the decimal wire format without guessing thousands", () => {
    expect(centavosWoo("19950")).toBe(1995000);
    expect(centavosWoo("12.50")).toBe(1250);
    expect(centavosWoo("12,50")).toBeNull();
    expect(centavosWoo("1.234")).toBeNull();
    expect(centavosWoo("-2")).toBeNull();
  });
  it("preserves the whole source record including additional product data", () => {
    const p = produto({ description: "<p>Medidas: 120 cm</p>", weight: "3", meta_data: [{ key: "garantia", value: "12 meses" }] });
    const mapped = mapearProduto(p, "CRC");
    expect(mapped.ficha_woocommerce).toMatchObject({ weight: "3", meta_data: p.meta_data });
    expect(mapped.descricao).toContain("120 cm");
    expect(mapped.preco_cents).toBe(1995000);
    expect(mapped).not.toHaveProperty("ativo");
  });
  it("does not assert availability for backorders, unpublished or unpriced products", () => {
    for (const extra of [{ stock_status: "onbackorder" }, { status: "draft" }, { price: "" }]) {
      expect(mapearProduto(produto(extra), "CRC").woo_disponivel).toBe(false);
    }
  });
  it("keeps variation identity and parent information", () => {
    const parent = produto({ type: "variable" });
    const child = produto({ id: 13, sku: "", attributes: [{ name: "Color", option: "Rojo" }] });
    expect(mapearProduto(child, "CRC", parent)).toMatchObject({ codigo: "WOO-13", woo_id: 13, woo_parent_id: 12, nome: "Foco Color: Rojo" });
  });
  it("rejects credentials in URLs and insecure HTTP", () => {
    const keys = { consumer_key: `ck_${"a".repeat(40)}`, consumer_secret: `cs_${"b".repeat(40)}` };
    for (const url of ["http://tienda.com", "https://user:pass@tienda.com", "https://tienda.com?key=x"]) expect(conexaoSchema.safeParse({ ...keys, url }).success).toBe(false);
  });
  it("does not carry executable markup into the text description", () => {
    expect(textoWoo("<script>attack()</script><p>Hola &amp; adiós</p>")).toBe("Hola & adiós");
  });
});
