---
impacto: nada_mudou
secao: corrigido
titulo: Los reintentos del agente conservan pendientes los mensajes nuevos
---
Si falla el guardado de memoria después de enviar una respuesta, el reintento ya no atribuye mensajes posteriores del cliente a esa respuesta anterior. Esos mensajes pueden continuar por su propio turno, manteniendo la protección contra respuestas duplicadas. No requiere migraciones ni cambios de configuración. Los trabajos que ya terminaron sin responder no se reenvían automáticamente.
