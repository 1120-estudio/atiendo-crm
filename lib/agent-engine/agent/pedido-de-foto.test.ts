import { describe, expect, it } from 'vitest';
import { prometeFotoSemAnexo, solicitaFoto } from './pedido-de-foto';

describe('pedido atual de foto', () => {
  it.each([
    'Sí, envíame la foto otra vez',
    'Envíame otra vez la foto del taladro SF777',
    'Reenvíame la foto',
    'Mándame las fotos del producto',
    '¿Puedes enviarme una imagen?',
    'Quiero ver la foto del taladro',
    'Pode mandar a foto novamente?',
    'Envie as imagens',
  ])('autoriza o envio solicitado: %s', pedido => {
    expect(solicitaFoto(pedido)).toBe(true);
  });
  it.each([
    '¿Cuánto cuesta y qué incluye?',
    'No me envíes la foto otra vez',
    'No quiero ver fotos',
    'No necesito más fotos',
    'No quiero que envíes fotos',
    'Não mande a foto',
    'La foto está bonita',
    '¿Tiene dos baterías?',
    'Quiero una cámara de fotos',
    'Necesito una impresora para fotografías',
  ])('não autoriza reenvio automático: %s', pedido => {
    expect(solicitaFoto(pedido)).toBe(false);
  });
});

describe('não afirmar envio de foto sem anexo', () => {
  const pedido = 'Sí, envíame la foto otra vez';
  it('reproduz a resposta observada e libera a mesma legenda só quando há foto preparada', () => {
    const body = 'Claro 😊 Te la envío otra vez aquí.';
    expect(prometeFotoSemAnexo(body, pedido, 0)).toBe(true);
    expect(prometeFotoSemAnexo(body, pedido, 1)).toBe(false);
  });
  it.each([
    'Te envío la foto del producto.',
    'Claro 😊 Te la reenvío aquí.',
    'Voy a reenviar la foto.',
    'Te reenviei a foto.',
    'Aquí tienes la imagen.',
    'Voy a enviar la foto.',
    'Adjunto la foto.',
    'Te mandei a foto.',
    'Aqui está a imagem.',
  ])('sem anexo recusa: %s', body => {
    expect(prometeFotoSemAnexo(body, pedido, 0)).toBe(true);
  });
  it.each([
    'Si quieres, te paso la foto otra vez.',
    'No puedo enviar la foto en este momento.',
    'No te la envío porque no quedó disponible.',
    'No te la reenvío porque no quedó disponible.',
    'El envío cuesta ₡3.500.',
    'La foto muestra el producto; el envío se cotiza aparte.',
    'No tengo una foto disponible; voy a consultar al equipo.',
    'Sí, lo tenemos disponible.',
  ])('não confunde oferta, falha ou custo de envio com anexo: %s', body => {
    expect(prometeFotoSemAnexo(body, pedido, 0)).toBe(false);
  });
  it('sem pedido de foto não interpreta referência a outra informação como imagem', () => {
    expect(prometeFotoSemAnexo('Te la envío aquí.', 'Necesito la dirección', 0)).toBe(false);
  });
  it('reclamação sobre foto ausente também impede nova promessa sem arquivo', () => {
    expect(prometeFotoSemAnexo('Ahora sí te la reenvío aquí.', 'No me enviaste la foto', 0)).toBe(true);
  });
});

