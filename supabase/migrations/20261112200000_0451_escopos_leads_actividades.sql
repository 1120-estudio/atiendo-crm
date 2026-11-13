-- Calcula la visibilidad de los leads de cada organización una sola vez por
-- consulta. Reutiliza el alcance definido en 0450, sin ampliar permisos:
--   - viewer, manager y admin: lectura de toda la organización;
--   - agent: propios y, en own_and_unassigned, los que no tienen responsable;
--   - platform_admin: conserva el acceso transversal existente.
-- `fn_can_view_lead` sigue siendo la referencia de autorización y los modos
-- de visibilidad deben producir el mismo conjunto de filas.
drop policy if exists "crm_leads_select" on public.crm_leads;
create policy "crm_leads_select" on public.crm_leads for select using (
  (select public.fn_is_platform_admin())
  or organization_id in (
    select org_id from public.fn_escopos_leitura_inbox() where acesso_total
  )
  or (
    owner_user_id = (select auth.uid())
    and organization_id in (select org_id from public.fn_escopos_leitura_inbox())
  )
  or (
    owner_user_id is null
    and organization_id in (
      select org_id from public.fn_escopos_leitura_inbox() where fila
    )
  )
);

-- A visibilidade da atividade é a do lead pai. Ao consultar crm_leads dentro
-- do EXISTS, o PostgreSQL aplica crm_leads_select (inclusive sua RLS); assim
-- evitamos recalcular fn_can_view_lead na policy de cada atividade. O filtro
-- de organização impede que uma referência inconsistente atravesse tenants.
drop policy if exists "crm_lead_activities_select" on public.crm_lead_activities;
create policy "crm_lead_activities_select" on public.crm_lead_activities
  for select using (
    exists (
      select 1
      from public.crm_leads l
      where l.id = crm_lead_activities.lead_id
        and l.organization_id = crm_lead_activities.organization_id
    )
  );
