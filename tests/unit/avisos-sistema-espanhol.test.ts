import { describe, expect, it } from "vitest";
import { traduzirAvisoDoSistema } from "@/lib/i18n/avisos-sistema";

describe("avisos do sistema em espanhol", () => {
  it("traduz avisos de conexão preservando o nome escolhido", () => {
    const texto = 'WhatsApp "Número de Santiago" desconectado — precisa escanear o QR de novo';
    expect(traduzirAvisoDoSistema("qr_rescan", texto, texto, "es"))
      .toBe('WhatsApp "Número de Santiago" desconectado: debes escanear el QR de nuevo');
  });
  it("traduz o aviso gerado para um número novo e mantém o português quando escolhido", () => {
    const titulo = "Número novo aguardando liberação (go-live)";
    expect(traduzirAvisoDoSistema("other", titulo, titulo, "es")).toBe("Número nuevo pendiente de habilitación");
    expect(traduzirAvisoDoSistema("other", titulo, titulo, "pt-BR")).toBe(titulo);
  });
  it("traduz o aviso de mídia sem alterar o detalhe externo", () => {
    const titulo = "O agente não conseguiu ler imagem que o cliente enviou";
    const corpo = "Motivo: a leitura deu erro em todas as tentativas, ao abrir o arquivo ou ao chamar o provedor de IA. O conteúdo do arquivo não chegou ao agente. Da próxima mensagem em diante ele sabe que houve um arquivo que não deu para ler, e responde avisando em vez de supor o que estava nele. Para resolver, ajuste o modelo desse ponto em Agente de IA → Provedores, ou cadastre a chave necessária em Credenciais. Detalhe técnico, para quem der suporte: código externo 123";
    const resultado = traduzirAvisoDoSistema("midia_nao_lida", titulo, corpo, "es");
    expect(resultado).toContain("la lectura falló en todos los intentos");
    expect(resultado).toContain("El contenido del archivo no llegó al agente");
    expect(resultado).toContain("Detalle técnico para soporte: código externo 123");
  });
  it("não modifica avisos livres criados por pessoas", () => {
    const livre = "Número novo aguardando liberação (go-live)";
    expect(traduzirAvisoDoSistema("handoff", livre, livre, "es")).toBe(livre);
  });
  it("traduz o aviso automático de perda sem alterar o nome da etapa", () => {
    const titulo = "O assistente quis marcar um negócio como perdido — e isso exige um motivo";
    const corpo = 'O assistente concluiu que este negócio deveria ir para "Sin respuesta", que no seu funil é uma etapa de perda. Perder um negócio exige um motivo, e o motivo é a razão que quem está no negócio reconhece — o assistente não inventa uma. Ninguém mexeu no card: ele continua onde estava. Se o negócio realmente se perdeu, abra o card no funil, use "Marcar como perdido" e informe o motivo; se não, não há nada a fazer.';
    expect(traduzirAvisoDoSistema("other", titulo, titulo, "es")).toContain("se necesita un motivo");
    expect(traduzirAvisoDoSistema("other", titulo, corpo, "es")).toContain('pasar a "Sin respuesta"');
    expect(traduzirAvisoDoSistema("other", titulo, corpo, "es")).toContain("La tarjeta sigue en su lugar");
  });
});
