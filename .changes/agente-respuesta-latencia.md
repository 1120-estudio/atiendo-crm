---
impacto: capacidade_nova
secao: corrigido
titulo: El agente recupera respuestas sin envío y reduce la espera inicial
---
Las consultas entrantes ya no terminan como completadas si el modelo omite el envío. El sistema realiza una recuperación limitada mediante la misma herramienta y sus validaciones; si sigue sin responder, registra el fallo para que la cola lo trate. La espera predeterminada para agrupar mensajes baja de ocho a dos segundos, respetando las configuraciones explícitas de cada instalación.
