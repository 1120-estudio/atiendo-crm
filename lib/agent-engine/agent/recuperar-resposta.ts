/** Recuperação limitada: texto livre nunca vira envio, e um veto não é contornado. */
export function criarTravaDeRecuperacao(): () => boolean {
  let tentou = false;
  return () => {
    if (tentou) return false;
    tentou = true;
    return true;
  };
}

export async function recuperarRespostaAusente(input: {
  deveResponder: boolean;
  temDesfecho: () => boolean;
  tentouEnviar: () => boolean;
  recuperar: () => Promise<void>;
}): Promise<void> {
  if (!input.deveResponder || input.temDesfecho()) return;
  // Só ensina a ferramenta que o modelo esqueceu. Uma tentativa vetada continua
  // sob a responsabilidade dos gates/da fila, sem segunda porta de envio.
  if (!input.tentouEnviar()) await input.recuperar();
  if (!input.temDesfecho())
    throw new Error("agent_no_reply: turno terminou sem resposta ou transferência");
}
