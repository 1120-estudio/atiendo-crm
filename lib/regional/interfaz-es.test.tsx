import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { RegiaoProvider } from "./RegiaoProvider";
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

const { criar } = vi.hoisted(() => ({ criar: vi.fn(async () => ({})) }));
vi.mock("@/hooks/contacts/useCreateContact", () => ({
  useCreateContact: () => ({ mutateAsync: criar, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions/auth/requestPasswordReset", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("@/app/actions/auth/updatePassword", () => ({ updatePassword: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("formulários em espanhol", () => {
  it("cria contato colombiano com telefone local e cédula, sem exigir CPF", async () => {
    render(
      <IdiomaProvider locale="es">
        <RegiaoProvider pais="CO">
          <NewContactDialog open onOpenChange={() => {}} />
        </RegiaoProvider>
      </IdiomaProvider>,
    );
    expect(screen.getByLabelText("País del teléfono")).toHaveValue("CO");
    fireEvent.change(screen.getByRole("textbox", { name: /Teléfono/ }), {
      target: { value: "3001234567" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Cédula/ }), {
      target: { value: "1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear contacto" }));
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ phone_number: "+573001234567", cpf: "1234567890" }),
      ),
    );
  });
  it("puede elegir un prefijo distinto al país de la empresa", async () => {
    render(
      <IdiomaProvider locale="es">
        <RegiaoProvider pais="CO">
          <NewContactDialog open onOpenChange={() => {}} />
        </RegiaoProvider>
      </IdiomaProvider>,
    );
    fireEvent.change(screen.getByLabelText("País del teléfono"), { target: { value: "CR" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Teléfono/ }), {
      target: { value: "88881234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear contacto" }));
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(expect.objectContaining({ phone_number: "+50688881234" })),
    );
  });
  it("recuperação mostra botão e erro de e-mail em espanhol", async () => {
    render(
      <IdiomaProvider locale="es">
        <ForgotPasswordForm />
      </IdiomaProvider>,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "invalido" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace de restablecimiento" }));
    await waitFor(() => expect(screen.getByText("Correo inválido")).toBeInTheDocument());
  });
  it("nova senha mostra requisitos em espanhol", () => {
    render(
      <IdiomaProvider locale="es">
        <ResetPasswordForm />
      </IdiomaProvider>,
    );
    expect(screen.getByText("8 o más caracteres")).toBeInTheDocument();
    expect(screen.getByText("Un símbolo")).toBeInTheDocument();
    expect(screen.getByText("Seguridad de la contraseña")).toBeInTheDocument();
    expect(screen.queryByText("8 ou mais caracteres")).toBeNull();
  });
});
