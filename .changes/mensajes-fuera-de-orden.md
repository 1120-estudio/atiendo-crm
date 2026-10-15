---
impacto: nada_mudou
secao: corrigido
titulo: Atiende mensajes recibidos fuera de orden
---
Un mensaje que se entrega tarde ya no se descarta por haberse enviado antes que otro mensaje atendido. El despacho toma la última entrada recibida en el CRM y conserva la agrupación del historial y la deduplicación de eventos. Se mantienen las restricciones de atención y los números autorizados. En Coolify, la ventana de agrupación vuelve a ocho segundos y puede configurarse con INBOUND_DEBOUNCE_MS; los valores explícitos, incluido cero, se conservan. No requiere migraciones; no reduce por sí mismo el retraso de entrega del proveedor.
