# Cotizador de envíos de Costa Rica

Disponible para agentes que tengan habilitada la capacidad **Cotizar envío en Costa Rica**. Lee el catálogo activo de la organización y la versión publicada del documento «Tarifas de envíos por destino — nueva versión». Conserva su identificador de versión en la respuesta. No exige migración ni contiene precios comerciales del cliente en el código.

El índice del documento debe conservar registros completos con provincia, cantón, distrito, código distrital de cinco dígitos y la tarifa de cada tamaño. Cada tarifa tiene importe en colones, cobertura PROPIA o EXTERNA y plazo en días hábiles. Use el editor de conocimiento existente para actualizar el documento y comprobar la indexación. Para cada SKU o variante activa, la descripción debe indicar «Paquete: pequeño», «Paquete: mediano» o «Paquete: grande».

Con un destino se cobra una tarifa del tamaño mayor si hay hasta una unidad grande. Dos unidades grandes pagan dos tarifas grandes. El cálculo devuelve el desglose en CRC. La cantidad se consolida por SKU antes de validar el inventario. Un dato comercial faltante exige revisión interna. Un distrito homónimo requiere aclarar el cantón o la provincia.

## Destinos compartidos

El pin que Zernio recupera de WhatsApp ya se representa como enlace de Google Maps. También se reconocen marcadores explícitos en enlaces de lugar, coordenadas de Waze y enlaces Waze con geohash. Un enlace corto de Maps se sigue sólo entre hosts de mapas permitidos. Una ruta, un centro de cámara, un enlace no reconocido o un punto muy próximo al límite requiere confirmar el distrito. La herramienta no envía coordenadas a un servicio de geocodificación.

Prepare la cartografía oficial mediante `python3 scripts/envios/preparar-distritos.py distritos.geojson`. El script consulta la capa pública Costa Rica Distritos (cuenta dperezu_cne) por identificador, exige geometría completa para cada lote y reemplaza el archivo anterior sólo al terminar. Mantenga actualizada la cartografía junto al tarifario. En el Compose de Coolify copie el archivo al volumen compartido `shipping-cr` con el nombre `distritos.geojson`. La web y el worker ya lo montan en modo lectura. En otros despliegues, monte el GeoJSON en modo lectura en los contenedores app y worker y configure en ambos `SHIPPING_CR_DISTRICTS_FILE` con su ruta interna. Sin la cartografía disponible se puede cotizar por distrito escrito.

Antes de habilitar en atención, compare pedidos conocidos de paquete pequeño, mediano, grande, dos grandes y entrega externa con la persona que valida los envíos. Pruebe un pin de un lugar público, un distrito homónimo y una referencia sin tamaño. Una cotización no reserva inventario, crea un pedido ni confirma el pago. Incluya su versión, importes y modalidad en el resumen de la conversación.
