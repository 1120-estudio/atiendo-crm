# Operación segura de 1120 en Coolify

Destino: núcleo (protección de documentos y validación regional) e infraestructura (transporte y despliegue). La operación común funciona sin extensiones.

## WhatsApp

`docker-compose.coolify.yml` entrega el webhook global a `http://app:3000/api/v1/webhooks/waha`. El app exige `WAHA_GLOBAL_WEBHOOK_REQUIRE_SECRET=true`: recibe una firma HMAC válida o el secreto de transporte `X-Waha-Webhook-Secret`. El compose usa `WHATSAPP_HOOK_HMAC_KEY` y `WHATSAPP_HOOK_CUSTOM_HEADERS`, documentados en https://waha.devlike.pro/docs/how-to/events/ . El secreto sale de `WAHA_HMAC_SECRET`, se transmite por la red Docker y se excluye del archivo de headers del webhook. Autenticación de transporte no significa firma: `valid_signature` conserva esa distinción. Una firma incorrecta sigue siendo rechazada.

La ruta por token para servidores externos sigue disponible. No publiques puertos de WhatsApp, Redis ni del puente HTTP de Redis.

Actualiza app y transporte juntos: exigir el secreto con una imagen/configuración antigua del transporte bloquearía mensajes. Tras desplegar, verifica un evento real y la ausencia de eventos procesados sin credencial. Conserva los volúmenes de sesiones y medios.

## Documentos personales

Aplica la migration `0447` antes de habilitar la nueva imagen. Está también en el baseline y MANIFEST. `encrypt_cpf(text,text)` devuelve una literal `bytea` válida usando pgcrypto AES-256. El backend pasa `CPF_ENCRYPTION_KEY`; no se envía al navegador, no se guarda en la tabla ni se registra en logs. Conserva la clave actual: cambiarla hace ilegibles los documentos cifrados con ella.

La creación y edición requieren cifra confirmada; una falla responde 503 sin guardar un hash huérfano ni reemplazar una cifra anterior. La importación informa el error por fila y continúa con las demás. `decrypt_cpf(uuid,text)` exige sesión autenticada y membresía aceptada, no revocada, manager/admin de la organización del contacto. No se concede descifrado a `anon` ni `service_role`. El handler conserva la auditoría del propósito y resultado sin registrar el documento.

Las validaciones regionales son de formato y no prueban identidad ni situación fiscal. Los perfiles operacionales mantienen `lei: null` y no inventan calendarios de feriados.

## Imágenes y actualización

El compose permite `APP_IMAGE`, `WORKER_IMAGE` y `SCHEDULER_IMAGE`. Usa las tres referencias inmutables de una misma versión verificada de `1120-estudio`. Los defaults conservan la versión instalada como piso de rollback; no apuntan automáticamente a una imagen todavía no publicada. Pasar las pruebas de un PR no publica esas imágenes: la publicación ocurre al entrar en `main` por el workflow del repositorio.

Antes de actualizar: respaldo de PostgreSQL, medios y sesiones; confirmar el resultado completo de CI; aplicar SQL; seleccionar las imágenes publicadas; desplegar desde Coolify. Verifica dominio, acceso, documento de prueba, recepción/respuesta y salud del worker. El healthcheck TCP confirma escucha del app, no todas sus dependencias.

## Revisión y pruebas

La zona horaria del perfil, empresa y bienvenida debe existir en `Intl`; datos legados conservan el fallback del runtime. Inbox y PDF de acceso usan el mismo formateador de importes que el Kanban (valores de negocio ×100), sin convertir monedas.

Casos relevantes: autenticación global con/sin firma y credencial; headers sin secretos; cifra y descifrado; aislamiento entre empresas; manager frente a agent; membresía revocada o sin aceptar; clave incorrecta; importación con falla de cifrado; zonas inválidas y monedas COP/CRC/USD. GitHub valida baseline y aislamiento en PostgreSQL 15 y 17 y las jornadas de navegador; una prueba local mínima no sustituye esa validación.

## Integración con la operación

Los formularios de contactos y la importación CSV llaman al contrato de cifrado;
la lectura autorizada vuelve al panel del contacto y conserva la auditoría
`contact.cpf_decrypted`. El mapa regional conecta API → RPC → persistencia.
Una falla muestra 503 o error por fila y permite corregir la configuración y
reintentar; no inicia tareas ni envíos nuevos. La atención IA/humano mantiene
su motor y contexto existentes. La opción de protección global se ve y cambia
en las variables de Coolify; su ausencia de credencial responde 401 antes del
registro del mensaje. Una ruta de autenticación fallida no necesita follow-up:
no acepta una demanda de cliente hasta autenticar el transporte.

El compose de Coolify mantiene seis servicios y usa el proxy del panel. El
compose de producción general conserva Caddy para la instalación tradicional;
el override single-server conecta app y worker a Supabase sin reintroducir
servicios de telefonía ausentes. No combines el compose tradicional con el de
Coolify.
