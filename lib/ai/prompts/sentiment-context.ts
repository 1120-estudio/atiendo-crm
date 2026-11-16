/** Limit the amount of conversation sent to the sentiment classifier. */
export function sentimentPrompt(
  current: string,
  messageId: string,
  history: Array<{ id: string; direction: string; body: string | null }>,
): string {
  const previous = history
    .filter((m) => m.id !== messageId && (m.direction === 'inbound' || m.direction === 'outbound') && m.body?.trim())
    .slice(0, 6)
    .reverse()
    .map((m) => ({ role: m.direction === 'inbound' ? 'cliente' : 'equipo', text: m.body!.slice(0, 500) }));
  return JSON.stringify({ historial: previous, mensaje_actual_del_cliente: current.slice(0, 2000) });
}
