---
impacto: nada_mudou
secao: corrigido
titulo: Agrupa consultas y evita repetir las fotos del producto
---
Un mensaje que se entrega tarde ya no se descarta por haberse enviado antes que otro mensaje atendido. El despacho toma la última entrada recibida en el CRM y conserva la agrupación del historial y la deduplicación de eventos. Se mantienen las restricciones de atención y los números autorizados. En Coolify, la ventana de agrupación pasa a quince segundos y puede configurarse con INBOUND_DEBOUNCE_MS; los valores explícitos, incluido cero, se conservan. Ampliar información sobre el mismo producto deja de adjuntar automáticamente fotos ya enviadas durante la atención actual; el cliente puede pedirlas de nuevo. No requiere migraciones; no reduce por sí mismo el retraso de entrega del proveedor ni garantiza reunir mensajes que lleguen después de la ventana.
