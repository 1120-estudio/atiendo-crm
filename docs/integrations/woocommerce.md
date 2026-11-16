# WooCommerce en Orbit

Integración opcional del catálogo existente. Cada organización conecta una tienda HTTPS desde Productos → WooCommerce. Requiere claves REST de lectura y el cifrado de secretos de la instalación (`fn_encrypt_oauth`). La moneda debe coincidir con la organización.

WooCommerce controla precios y disponibilidad. La importación conserva por defecto las descripciones y fotos existentes; la ficha original completa se conserva en `ficha_woocommerce`. El agente recibe características y datos comerciales de esa ficha. Los campos de plugins que no estén en la API requieren un adaptador específico; no se raspa HTML ni se ejecutan shortcodes.

Los artículos nuevos entran con `ativo=false`. Activarlos autoriza su consulta por los agentes que usan el catálogo de la organización. El control actual es por organización, no una lista independiente por agente. Un SKU exacto vincula una ficha existente; los conflictos detienen el lote y aparecen en el panel. Un cambio de tienda se rechaza para impedir colisiones de IDs externos.

El scheduler procesa lotes de cinco productos cada minuto. Las variaciones mantienen el ID externo y el padre; no se ofrece el padre variable como un artículo con precio ambiguo. Un ciclo completo se repite cada quince minutos. Se conserva el cursor si falla; el reintento ocurre a los cinco minutos. La concesión de trabajo es atómica y expira si el proceso cae. La eliminación lógica solo ocurre al completar un ciclo exitoso y solo afecta productos vinculados a WooCommerce.

Los webhooks se configuran manualmente en WooCommerce con la URL y el secreto que muestra Orbit al conectar. Usar producto creado, actualizado y eliminado. Se autentican con HMAC SHA256 sobre los bytes originales y adelantan la conciliación, sin confiar en el contenido para sobrescribir productos. Reconectar rota el secreto.

Las galerías se guardan en el bucket privado catalog-photos. WebP se valida por firma y se rechaza animación VP8X. Se conserva el límite de 5 MB por archivo. El envío WebP debe comprobarse en el canal real antes de activar producción: una prueba de CI no demuestra recepción por WhatsApp.

## Verificación y despliegue

Ejecutar typecheck, lint, pruebas unitarias, `pnpm test:db` (incluye install/update del baseline) y shell scheduler en Actions. Antes de desplegar: respaldo de base y Storage, revisar migraciones 0450/0451, aplicar 0452 y publicar app/worker/scheduler de la misma revisión. No borrar volúmenes ni reemplazar datos. Probar ficha simple, oferta, agotado, variable, SKU existente, eliminación y foto recibida en el canal de pruebas.

## Conexiones del sistema

Entrada: WooCommerce REST/webhooks → cola por organización → catálogo local → crm_search_products y fotos de send_message. Superficie y estado: Productos → WooCommerce. Registro: woocommerce.connected/state_changed/synced en auditoría. Recuperación: cursor persistente, lease y reintento; errores visibles en el panel. Pausar conserva las fichas e historial.
