/** Regras de foto baseadas no pedido atual, nunca no histórico antigo. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const FOTO = /\b(?:fotos?|fotografias?|imagen(?:es)?|imagens|imagem)\b/;

/** Pedido direto permite enviar de novo; não depende de o modelo lembrar um flag. */
export function solicitaFoto(pedido: string): boolean {
  const texto = normalizar(pedido);
  if (!FOTO.test(texto)) return false;
  // Conservador: com negação, o modelo deve resolver a intenção pelo campo
  // explícito. A heurística nunca transforma uma recusa em autorização.
  if (/\b(?:no|nao)\b/.test(texto)) return false;
  return /\b(?:reenviame|reenvia|reenviar(?:me|nos)?|reenvie|enviame|envianos|mandame|mandanos|pasame|comparteme|envia|envias|envie|manda|mandas|mande|enviar(?:me|nos)?|mandar(?:me|nos)?|pasar|compartir|mostrar(?:me)?|muestrame|ver)\b/.test(texto)
    || /\b(?:quiero|quero|necesito|preciso)\s+(?:(?:una|unas|la|las|uma|umas|a|as)\s+)?(?:fotos?|fotografias?|imagen(?:es)?|imagens|imagem)\b/.test(texto);
}

/** Veta uma promessa concreta de foto quando não há foto preparada para enviar. */
export function prometeFotoSemAnexo(body: string, pedido: string, fotos: number): boolean {
  if (fotos > 0) return false;
  const texto = normalizar(body);
  if (!FOTO.test(texto) && !FOTO.test(normalizar(pedido))) return false;
  // Oferecer para depois ou explicar uma impossibilidade não afirma envio.
  if (/\b(?:si quieres|si queres|se quiser|puedo|podria|posso)\b/.test(texto)) return false;
  if (/\b(?:no|nao)\s+(?:(?:te|lhe|la|las|a|as)\s+){0,3}(?:reenvio|reenviando|reenviei|envio|mando|adjunto|comparto|paso|enviei|mandei|anexei)\b/.test(texto)) return false;
  return /\b(?:te|le|les|lhe)\s+(?:(?:la|las|lo|a|as)\s+)?(?:reenvio|reenviando|reenviamos|reenviei|envio|mando|adjunto|comparto|paso|envie|mande|enviei|mandei)\b/.test(texto)
    || /\b(?:adjunto|anexo|anexei|compartilho)\b/.test(texto)
    || /\b(?:reenvio|envio|mando|comparto|paso)\s+(?:(?:una|la|las|unas|a|as|uma)\s+)?(?:fotos?|imagen(?:es)?|imagens|imagem)\b/.test(texto)
    || /\b(?:voy a|vou)\s+(?:reenviar|enviar|mandar|adjuntar|compartir|anexar)\b/.test(texto)
    || /\baqui\s+(?:tienes|tenes|esta|estan|vai|tem)\b/.test(texto);
}

