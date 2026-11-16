# Revisión local de consultas e IA

Estado: revisión en curso. El inventario de carpetas y rutas no equivale a una prueba exhaustiva de cada operación. No se realizaron envíos ni pruebas con proveedores externos.

## Incidente de lectura del inbox

El 12 de noviembre de 2026 se comprobó con la sesión de la asesora que una lectura del historial solicitando un solo mensaje devolvió `internal_error` y `canceling statement due to statement timeout`. El historial también llegó a cargar en otros intentos; el fallo es intermitente. No se ha identificado si el tiempo se consume en políticas de visibilidad, saturación, bloqueos o una combinación.

La migración 0449 acelera el acceso de perfiles con visibilidad general, pero conserva la función original para agentes. En una transacción local revertida con 1.500 conversaciones y 6.000 mensajes sintéticos, PostgreSQL usó el índice de conversación y evaluó la visibilidad de la conversación por cada mensaje examinado; la consulta de cuatro mensajes tardó 8,6 ms en esa muestra. La prueba no reproduce el volumen ni la carga de producción y no demuestra por sí sola la causa. Antes de modificar políticas se requieren planes y tiempos representativos y pruebas de aislamiento para todos los modos de visibilidad.

La migración local 0450 prepara el alcance por organización también para agentes. En una segunda transacción revertida con los mismos datos, contar conversaciones pasó de aproximadamente 2,3 segundos a 10 milisegundos. Se compararon los identificadores visibles contra la función original en los modos `own`, `own_and_unassigned` y `all`, y se comprobaron mensajes propios y ajenos, usuario externo, viewer y revocación. Se ejecutó dos veces la migración dentro de la transacción. El 12 de noviembre de 2026 también pasaron 28 pruebas de visibilidad y aislamiento en un contenedor PostgreSQL 15 temporal, con instalación y actualización del baseline. La suite completa de invariantes y la validación con carga real siguen pendientes; el cambio no se aplicó de forma permanente a ninguna base.

La migración local 0451 extiende el alcance calculado a `crm_leads` y hace que las actividades hereden la visibilidad del lead mediante RLS. Se preparó por la diferencia observada entre administradores y asesores en el informe y el panel. Aún no se ejecutaron pruebas de equivalencia ni mediciones para estos objetos; no se ha aplicado en producción.

## Flujos examinados

| Área | Observación | Estado |
| --- | --- | --- |
| Atención con IA | Instrucciones, capacidades y memoria se leen en paralelo en cada turno. | Cambiado; pruebas unitarias aprobadas. |
| Contexto de conversación | Historial, decisiones humanas y resultados anteriores son lecturas independientes. | Cambiado; se conservan los filtros y datos; pruebas unitarias aprobadas. |
| Avisos de IA | El conteo de pendientes puede consultarse junto con las listas por gravedad. Los destinos siguen sujetos a permisos y lecturas autenticadas. | Cambiado; pruebas de orden y permisos aprobadas. |
| Embudos | El tablero agrupa información por lotes, pero ejecuta enriquecimientos sucesivos. Una de las etapas puede generar avisos de ambigüedad. | Pendiente medir y estudiar antes de paralelizar los efectos. |
| Contactos | El resumen obtiene información independiente en paralelo; la importación verifica duplicados por identificador. | Lectura de rutas principales; pendientes escalabilidad e integración. |
| Tareas y productos | Los listados principales usan una consulta con límite de 500 registros. | Pendiente verificar experiencia y cobertura con más registros. |
| Métricas y prospección | Varias lecturas principales ya se hacen en paralelo. Prospección puede cargar hasta 5.000 candidatos. | Pendiente medir volumen y tiempos con datos representativos. |
| Campañas | La ruta de métricas solicita hasta 20.000 destinatarios y declara parcial al alcanzar ese número, mientras el Supabase local configura `max_rows = 1000`. | Riesgo de conteo incompleto sin aviso; comprobar con datos de prueba y corregir paginación o agregación. |
| Agenda | La disponibilidad usa un cálculo compartido entre interfaz y herramientas del agente. | Pendiente medir consultas y probar concurrencia de reservas. |
| Seguridad de IA | Las verificaciones por organización y la cadena previa al envío son distintas de las consultas de preparación. | No se desactivaron; pruebas unitarias de cadena aprobadas. Pendiente validar casos reales sin usar el número personal. |

## Áreas pendientes de revisión detallada

Administración, publicidad, auditoría, llamadas y voz, automatizaciones y crons, conexiones y canales, extensiones, facturación, integraciones, captura de leads, privacidad, notificaciones, informes, configuración, equipo, webhooks y las rutas restantes de IA, agenda y conversaciones. También faltan mediciones de latencia, carga y calidad de respuestas con un entorno y datos de prueba representativos.
