-- 0446: nueva versión de la guía de agenda en español con las herramientas reales.
-- Corrige la omisión y el consejo de cancelar + crear al reprogramar de la 0445.
-- Las versiones son inmutables. Solo mueve el puntero de plataforma;
-- las copias instaladas o personalizadas por organizaciones no se modifican.
-- Idempotencia por hash del cuerpo, comprobado después de insertarlo.

do $seed$
declare
  v_id uuid;
  v_md5 constant text := '6b7e535c38bbfed54d63b4078b7e1d5d';
  v_desc constant text := 'Guía para agendar, reprogramar y cancelar citas con las herramientas del CRM: consulta disponibilidad real y confirma cada operación con su resultado.';
begin
  select id into v_id
    from public.skill_versions
   where organization_id is null and name = 'agendamento' and md5(body) = v_md5
   order by created_at desc
   limit 1;

  if v_id is null then
    insert into public.skill_versions (organization_id, name, description, body, matcher)
    values (
      null,
      'agendamento',
      v_desc,
      $body$# Guía: agendar citas

## Cuándo usarla
El cliente pide reservar un horario, consulta, visita, demostración, reunión o
sesión: cualquier compromiso con fecha y hora. Es común en salud, inmobiliarias
(visitas), servicios y consultoría.

## Regla de oro: nunca inventes disponibilidad
Si no tienes acceso confirmado a la agenda real del negocio, NO ofrezcas un horario
específico. Di que vas a confirmar y deriva, o pregunta la preferencia del cliente y
avisa que la confirmación llega enseguida. Prometer un horario que después no existe
rompe la confianza y obliga a reprogramar.

## Herramientas de agenda
- Si está disponible `crm_list_event_types`, llámala primero: usa el
  `event_type_slug` que devuelve, sin inventar ni traducir el identificador.
- Consulta `crm_find_free_slots` antes de ofrecer horarios. Ofrece opciones que
  realmente devolvió. Copia `inicio` al parámetro `starts_at`; presenta `cuando`
  al cliente. No conviertas fechas ni reconstruyas intervalos UTC por tu cuenta.
- Si devuelve `publicou_horarios: false`, el responsable no publicó su jornada:
  no significa que la agenda esté llena. Deriva para confirmar disponibilidad.
- Si devuelve `fuso_suposto: true`, pide confirmar la zona horaria.
- Si falta una herramienta necesaria o devuelve un error, explica el pendiente
  y deriva a una persona; no afirmes que ejecutaste la operación.

## Flujo

**1. Identifica el servicio o motivo antes de ofrecer horario**
- SI el cliente solo dijo "quiero agendar" sin contexto, pregunta primero el motivo
  o servicio. Agendar sin saber qué genera errores (una consulta de 20 minutos en un
  espacio de una hora, o al revés).

**2. Ofrece opciones cerradas, no una pregunta abierta**
- SI tienes acceso a la agenda real, ofrece 2 o 3 horarios concretos ("tengo el
  martes a las 14 o el miércoles a las 10, ¿cuál te queda mejor?"). Preguntar "¿qué
  horario prefieres?" genera idas y vueltas.
- SI no tienes acceso a la agenda, no inventes. Di algo como "voy a confirmar la
  disponibilidad y te escribo enseguida" y deriva a quien tenga acceso.

**3. Pide los datos necesarios antes de confirmar**
- Nombre completo del cliente (o confirma el que ya está en el CRM).
- Servicio o motivo concreto.
- Sede o lugar, si el negocio tiene más de uno.
- Si es una reprogramación, el horario anterior que se reemplaza.

**4. Reserva y comunica el resultado real**
- Cuando el cliente elija y confirme un horario, usa `crm_book_appointment`
  con el `starts_at` que devolvió `crm_find_free_slots`.
- Solo anuncia que se reservó después del resultado exitoso de la herramienta.
- Si devuelve `aguarda_confirmacao: true`, informa que la reserva espera
  aprobación del equipo; no digas que está confirmada.
- Si el horario dejó de estar disponible, consulta de nuevo y ofrece opciones.

**5. Reprogramar y cancelar**
- Si pide reprogramar, identifica la cita existente y consulta el nuevo horario
  con `crm_find_free_slots`. Tras confirmar la elección del cliente, usa
  `crm_reschedule_appointment` con el mismo `appointment_id` y el nuevo instante
  en `new_starts_at`. Reprogramar conserva la cita y su historial: NO canceles
  y crees otra para cambiar la hora.
- Si pide cancelar, confirma su intención y usa `crm_cancel_appointment` con el
  identificador de la cita. Anuncia la cancelación solo si la herramienta tuvo éxito.
- Si falta la herramienta necesaria, deriva a una persona sin anunciar cambios.
- `crm_schedule_followup` programa un seguimiento interno, no una cita acordada
  con el cliente. No lo uses como sustituto de `crm_book_appointment`.

**6. Riesgo de que no se presente**
- Si el negocio tiene documentada una política de recordatorio el día anterior,
  síguela. Si no la tiene, no inventes una: solo confirma la cita.

## Reglas firmes
- Nunca confirmes un horario sin haber revisado la disponibilidad real (o sin avisar
  que todavía falta confirmarlo).
- Nunca agendes dos compromisos que se superpongan para el mismo cliente sin avisar.
- Si pide un horario fuera del horario de atención y eso no está en las reglas del
  negocio, no lo confirmes: explica cuándo se atiende.
- Pide datos sensibles (dirección completa, documento) solo si el negocio de verdad
  los necesita para la cita.

## Ejemplos de respuesta (tono, no copiar literal)
- "Para reservarte bien: ¿para qué servicio o motivo es?"
- "Tengo el jueves a las 15 o el viernes a las 9, ¿cuál te queda mejor?"
- "Confirmado: consulta el 28/07 a las 15, en la sede Centro. ¿Me lo confirmas?"

## Qué NO hacer
- No preguntes "¿qué horario prefieres?" sin ofrecer opciones cuando tienes la agenda.
- No confirmes la cita sin una respuesta explícita del cliente.
- No inventes disponibilidad que no revisaste.
$body$,
      '{"any_keywords": ["agendar", "marcar horário", "marcar consulta", "marcar uma visita", "agenda", "que horas vocês", "horário disponível", "remarcar", "reagendar", "cancelar o horário", "desmarcar", "sacar turno", "pedir turno", "turno", "reservar", "pedir una cita", "una cita", "coordinar una visita", "agendar una visita", "horario disponible", "reprogramar", "cambiar el turno", "cancelar el turno", "cancelar la cita"], "probe_keywords": ["que horas", "qual dia", "tem vaga", "disponibilidade", "a qué hora", "qué día", "hay lugar", "disponibilidad", "tienen horario"]}'::jsonb
    )
    returning id into v_id;
    if (select md5(body) from public.skill_versions where id = v_id) is distinct from v_md5 then
      raise exception 'agendamento: el hash del cuerpo publicado no coincide';
    end if;
  end if;

  update public.skill_pointers
     set version_id = v_id, updated_at = now()
   where organization_id is null and name = 'agendamento' and version_id <> v_id;
  if not exists (select 1 from public.skill_pointers where organization_id is null and name = 'agendamento') then
    insert into public.skill_pointers (organization_id, name, version_id) values (null, 'agendamento', v_id);
  end if;
end
$seed$;
