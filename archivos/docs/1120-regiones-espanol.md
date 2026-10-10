# Español y regiones de 1120

Destino: núcleo del fork. Configuración transversal, disponible sin activar extensiones.
Base de trabajo: `1120-estudio/atiendo-crm`, main `c6fd38ef107bfa25b2de6e09248c2cd7ab481c6c`.

## Cambios implementados

| País | Moneda | Zona principal | Prefijo | Documento personal | Identificador fiscal de la empresa |
|---|---|---|---|---|---|
| Colombia | COP | America/Bogota | +57 | Cédula / CE / pasaporte | NIT |
| Costa Rica | CRC | America/Costa_Rica | +506 | Cédula / DIMEX / pasaporte | Cédula jurídica / NITE |
| Panamá | USD | America/Panama | +507 | Cédula / pasaporte | RUC / DV |
| Estados Unidos | USD | America/New_York | +1 | SSN / ITIN / pasaporte | EIN |

Estados Unidos también dispone de Chicago, Denver, Los Ángeles, Phoenix, Anchorage y Honolulu. El catálogo de zonas `lib/tempo/fusos.ts` alimenta empresa, perfil, bienvenida, disponibilidad y ventana de envío. Las reglas de horario de verano vienen de IANA/Intl; no se fijan desplazamientos UTC manuales.

Las plantillas de confirmación y recuperación se sirven en `APP_LOCALE`, sin depender de cookies ni del idioma del proceso GoTrue. Conservan `{{ .RedirectTo }}&token_hash={{ .TokenHash }}` y el escape de datos de marca. Los asuntos se configuran por separado en GoTrue.

Las alertas dinámicas de edición, publicación e historial de agentes pasan por `t()`; se añadió la traducción de “Conclua a configuração e publique uma versão.”. Los formularios de recuperación y nueva contraseña existentes se comprobaron en español.

## Datos y compatibilidad

No hay ALTER de tablas: `organizations.country` acepta códigos de dos letras y `organizations.currency` códigos de tres letras. El identificador fiscal usa la columna histórica `organizations.cnpj`; el documento personal usa `contacts.cpf_encrypted` y `cpf_hash`. No se cambia el nombre de esas columnas ni los permisos.

Los documentos se validan por forma; no se consulta un emisor, no se certifica titularidad y no se comprueba la situación fiscal. La validación de CPF brasileño conserva su checksum. El hash conserva las letras de pasaportes y los separadores de cédulas estructuradas; el hash de CPF brasileño existente se conserva. Las nuevas escrituras de la API normalizan antes de cifrar.

El país del teléfono puede elegirse independientemente del país de la empresa. Un + explícito se respeta. La importación usa el país de la empresa para números locales. Los documentos personales usan el país de la empresa: no se añade un país ni un tipo de documento independiente a cada contacto, ni un segundo identificador fiscal por contacto. El identificador fiscal implementado aquí es el de la empresa.

Los nuevos perfiles tienen `lei: null` y calendario sin días festivos locales. El PDF no cita la LGPD brasileña para estos países. Esto no convierte los plazos de privacidad existentes en plazos legalmente revisados para los cuatro países.

La anonimización reconoce documentos rotulados y SSN con separadores. No cubre todos los documentos sin rótulo; los nombres siguen la lista de nombres existente. El patrón no es un detector universal de PII.

La preferencia de idioma existente se conserva. Textos libres guardados por operadores, prompts, nombres de etapas y mensajes de clientes no se reescriben automáticamente. No se afirma haber traducido toda respuesta de todas las API.

## Fuentes de identificación consultadas

- Colombia: https://www.dian.gov.co/tramitesservicios/tramites-y-servicios/tributarios/Paginas/RUT.aspx
- Costa Rica: https://www.hacienda.go.cr/docs/FacturaElectronica.pdf y https://www.hacienda.go.cr/docs/MH-DGA-CIR-0005-2026.pdf (consecutivo jurídico alfanumérico).
- Panamá: https://dgi.mef.gob.pa/Ruc/Ruc
- Estados Unidos: https://www.irs.gov/tin/taxpayer-identification-numbers-tin

## Living System Checklist

1. Entrada: `TenantForm` → `updateTenant` → `organizations.country`; `AppLayout` lee la organización activa validada y entrega el país a `RegiaoProvider`. Correo: `APP_LOCALE` → `idiomaDaInstalacao`.
2. Salida: `NewContactDialog`, `contactCreateSchemaDoPais`, `contactPatchSchemaDoPais`, CSV, `padroesDePii`, `formatCents`, `FUSOS_OFERECIDOS` y plantillas GoTrue.
3. Registro: las escrituras conservan `org.updated`, `contact.created` y la auditoría existente de contactos/importación. Traducción y catálogos puros no generan mutaciones.
4. Pantalla: Configuraciones › Empresa/Perfil; Contactos › Nuevo contacto/Importar; recuperación de contraseña y correos de acceso.
5. Puerta: destinos existentes de `lib/navigation/catalogo.ts`; no se añade una pantalla sin navegación.
6. Continuidad de demanda: no se cambia el motor de atención. Validación fallida muestra error y conserva el formulario para corregirlo.
7. Configuración: país/moneda/zona en Empresa, zona en Perfil, idioma de instalación en `APP_LOCALE`; plantilla vacía en GoTrue sigue requiriendo configurar su URL.
8. IA/humano: se conserva la entrega y autorización existentes; el cambio no añade envíos ni autonomía.
9. Retorno: una validación inválida impide guardar y permite corregir y reintentar; ninguna decisión automática nueva necesita aprendizaje.
10. Mapa: `docs/architecture/regiones-1120.architecture.json` conecta configuración, registro, formularios, API/importación y correos.

## Validación y límites

Los resultados finales y los pasos de instalación se entregan en `LEEME-1120.txt` dentro del paquete. No se ha desplegado esta versión ni probado contra el VPS del usuario. Sin Docker/Supabase local no se ha ejecutado la jornada completa en una instalación fresca. El diagnóstico de la IA que dejó de responder sigue pendiente y no está resuelto por esta actualización.
