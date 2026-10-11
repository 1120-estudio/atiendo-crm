import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: mocks.error }));

import { ProdutosClient } from "@/app/app/products/_client";
import type { Produto } from "@/lib/schemas/produtos";

const produto: Produto = {
  id: "11111111-1111-4111-8111-111111111111",
  codigo: "EST-1",
  nome: "Estante",
  descricao: "Cinco níveis\nAço resistente",
  marca: "Marca",
  categoria: "Móveis",
  preco_cents: 2495000,
  moeda: "COP",
  custo_cents: 2000000,
  controla_estoque: true,
  quantidade: 3,
  ativo: false,
  origem: "manual",
  imagem_url: null,
  fotos: [],
  updated_at: "2026-10-11T00:00:00Z",
};
const textos = { titulo: "Produtos", subtitulo: "", vazio: "", vazioDica: "" };
function montar(itens: Produto[] = [produto], podeEditar = true) {
  render(
    <ProdutosClient
      inicial={itens}
      moeda="COP"
      urlsDasFotos={{}}
      podeEditar={podeEditar}
      textos={textos}
    />,
  );
}
function preencher(campo: string, valor: string) {
  fireEvent.change(screen.getByTestId(campo), { target: { value: valor } });
}
beforeEach(() => vi.clearAllMocks());

describe("gestão do catálogo", () => {
  it("cadastra descrição e características e mostra o preço interpretado em COP", async () => {
    montar([]);
    fireEvent.click(screen.getByTestId("novo-produto"));
    preencher("produto-codigo", "EST-1");
    preencher("produto-nome", "Estante");
    preencher("produto-descricao", "Cinco níveis\nAço resistente");
    preencher("produto-preco", "24950");
    expect(screen.getByTestId("preco-interpretado").textContent?.replace(/\u00a0/g, " ")).toBe(
      "Valor que será salvo: $ 24.950 (COP)",
    );
    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/api/v1/products",
        expect.objectContaining({
          preco_cents: 2495000,
          descricao: "Cinco níveis\nAço resistente",
        }),
      ),
    );
    expect(mocks.post.mock.calls[0]?.[1]).not.toHaveProperty("moeda");
  });

  it("edita produto desativado sem multiplicar o preço nem perder descrição e custo", async () => {
    montar();
    fireEvent.click(screen.getByTestId("editar-EST-1"));
    expect(screen.getByTestId("produto-preco")).toHaveValue("24950.00");
    expect(screen.getByTestId("produto-descricao")).toHaveValue(produto.descricao);
    preencher("produto-preco", "29950");
    preencher("produto-descricao", "Seis níveis\nGarantia de um ano");
    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        `/api/v1/products/${produto.id}`,
        expect.objectContaining({
          preco_cents: 2995000,
          custo_cents: 2000000,
          quantidade: 3,
          descricao: "Seis níveis\nGarantia de um ano",
        }),
      ),
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch.mock.calls[0]?.[1]).not.toHaveProperty("ativo");
  });

  it("permite limpar descrição, marca e categoria de um produto existente", async () => {
    montar();
    fireEvent.click(screen.getByTestId("editar-EST-1"));
    preencher("produto-descricao", "");
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          descricao: "",
          marca: "",
          categoria: "",
        }),
      ),
    );
  });

  it("edita na moeda original do produto mesmo se a empresa agora usa outra moeda", async () => {
    montar([{ ...produto, moeda: "USD", preco_cents: 2995003 }]);
    fireEvent.click(screen.getByTestId("editar-EST-1"));
    expect(screen.getByTestId("produto-preco")).toHaveValue("29950.03");
    expect(screen.getByTestId("preco-interpretado")).toHaveTextContent("$29,950.03 (USD)");
    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          preco_cents: 2995003,
        }),
      ),
    );
    expect(mocks.patch.mock.calls[0]?.[1]).not.toHaveProperty("moeda");
  });

  it("cancela a exclusão sem remover nada e só exclui após confirmação", async () => {
    montar();
    fireEvent.click(screen.getByTestId("excluir-EST-1"));
    expect(mocks.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar", exact: true }));
    expect(mocks.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("excluir-EST-1"));
    fireEvent.click(screen.getByTestId("confirmar-exclusao-produto"));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith(`/api/v1/products/${produto.id}`),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("mantém a confirmação aberta se a exclusão falhar", async () => {
    mocks.delete.mockRejectedValueOnce(new Error("indisponível"));
    montar();
    fireEvent.click(screen.getByTestId("excluir-EST-1"));
    fireEvent.click(screen.getByTestId("confirmar-exclusao-produto"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("permite leitura da descrição sem oferecer ações de escrita ao viewer", () => {
    montar([produto], false);
    expect(screen.getByText(/Cinco níveis/)).toBeInTheDocument();
    expect(screen.queryByTestId("editar-EST-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("excluir-EST-1")).not.toBeInTheDocument();
  });
});
