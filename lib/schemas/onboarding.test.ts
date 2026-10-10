import { describe, it, expect } from "vitest";
import { welcomeSchema } from "./onboarding";
describe("fuso na entrada", () => {
  it("preserva o default e aceita o fuso colombiano", () => {
    expect(welcomeSchema.parse({ display_name: "1120" }).timezone).toBe("America/Sao_Paulo");
    expect(
      welcomeSchema.parse({ display_name: "1120", timezone: " America/Bogota " }).timezone,
    ).toBe("America/Bogota");
  });
  it("recusa fuso que o runtime não consegue usar", () => {
    expect(
      welcomeSchema.safeParse({ display_name: "1120", timezone: "America/Bogotá" }).success,
    ).toBe(false);
  });
});
