import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ funil: { isLoading: false, isError: true, data: undefined as { pipeline: { id: string } } | undefined } }));
vi.mock("@/hooks/pipelines/useDefaultPipeline", () => ({ useDefaultPipeline: () => estado.funil }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined, isLoading: false, isError: false }) }));
import { usePrevisaoFunil } from "@/hooks/metrics/usePrevisaoFunil";

describe("previsão quando o funil padrão não está disponível", () => {
  it("mostra erro quando o carregamento do funil falha", () => {
    const { result } = renderHook(() => usePrevisaoFunil());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
  });
  it("continua carregando enquanto busca o funil", () => {
    estado.funil = { isLoading: true, isError: false, data: undefined };
    const { result } = renderHook(() => usePrevisaoFunil());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
  });
});
