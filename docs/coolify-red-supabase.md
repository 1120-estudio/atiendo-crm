# Red de Supabase en Coolify

Destino: infraestructura. La operación común conserva el mismo valor predeterminado y no requiere activar ninguna función por organización.

`docker-compose.coolify.yml` conecta `app` y `worker` a una red externa mediante `SUPABASE_NETWORK`. Si la variable está vacía o ausente, utiliza `pslkgetwjyaalqwbv0eueqem`, la red de la instalación 1120 existente.

Para una instalación independiente, obtiene el nombre de la red de su contenedor de base de datos:

```bash
docker inspect <contenedor-supabase-db> --format '{{range $nombre, $red := .NetworkSettings.Networks}}{{println $nombre}}{{end}}'
```

En Coolify, abre el recurso del CRM → Environment Variables y guarda `SUPABASE_NETWORK` con el nombre de la red del servicio Supabase de ese VPS. Configura también `SUPABASE_DB_URL` con el nombre del contenedor de esa base y `NEXT_PUBLIC_SUPABASE_URL`, la clave anon y la clave service role del nuevo servicio. No reutilices credenciales entre instalaciones.

La red debe existir antes del deploy. Docker Compose muestra un error de red externa si el nombre no existe; corrige la variable y vuelve a desplegar. No se crean redes ni se cambian los volúmenes de Supabase o WhatsApp con este ajuste.

## Living System Checklist

Entrada: Environment Variables de Coolify → interpolación de `networks.supabase.name` en `docker-compose.coolify.yml`.
Salida: conexión de `app` y `worker` a la red externa existente de Supabase.
Superficie y retorno: el operador ve y edita la variable en Coolify; el log del deploy informa una red inexistente y permite corregir y reintentar.
Actividad: log de despliegue de Coolify, sin mutaciones de datos del CRM.
Continuidad y navegación: no se cambia ninguna decisión del agente, demanda, pantalla ni puerta del producto. La topología conserva los servicios existentes; solo se parametriza el nombre de la red.
