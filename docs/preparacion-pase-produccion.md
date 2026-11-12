# Preparación para el pase a producción

Los cambios están en la rama local `diseno-interfaz-atiendo`. Este documento no autoriza ni ejecuta una publicación.

## Comprobado

- La migración 0450 se probó con datos sintéticos y una transacción revertida; la comparación local mostró menor tiempo para el conteo de conversaciones de un agente.
- En un contenedor temporal con PostgreSQL 15, el baseline se instaló y reaplicó correctamente y pasaron 28 pruebas enfocadas en visibilidad y aislamiento del inbox.
- Las pruebas de componentes, traducción y tipos realizadas durante los cambios están descritas en la conversación y en el registro de revisión local.

## Antes de publicar

- Terminar los cambios solicitados y revisar juntos el resultado local en escritorio y móvil.
- Ejecutar las comprobaciones correspondientes al conjunto final: tipos, lint, pruebas unitarias, invariantes de base de datos y pruebas de interfaz relevantes; revisar los resultados fallidos, si los hay.
- Verificar la migración 0450 con la versión y configuración de producción, incluyendo soporte temporal y los roles y modos de visibilidad, y medir el efecto sobre el listado y el historial. La mejora medida localmente no garantiza resolver todos los tiempos agotados.
- Comprobar una copia de seguridad reciente y el procedimiento de recuperación adecuado para el estado final, sin exponer credenciales.
- Preparar una revisión concreta del paquete y solicitar autorización para el pase. No hacer push, migrar ni desplegar antes de esa autorización.

Ver [auditoría local de consultas e IA](auditoria-local-consultas-ia.md) para el alcance, los resultados y los asuntos pendientes.
