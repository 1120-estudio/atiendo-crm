-- Calcula o acesso irrestrito por organização uma vez por consulta. O ramo
-- original continua sendo a autoridade para agentes e casos especiais.
-- SECURITY INVOKER: não contorna RLS e não altera privilégios de escrita.
drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations for select using (
  (select public.fn_is_platform_admin())
  or organization_id in (
    select org_id from public.fn_user_org_ids() org_id
    where public.fn_user_role_in_org(org_id) in ('viewer', 'manager', 'admin')
  )
  or public.fn_can_view_conversation(organization_id, assigned_to_user_id)
);

drop policy if exists "crm_leads_select" on public.crm_leads;
create policy "crm_leads_select" on public.crm_leads for select using (
  (select public.fn_is_platform_admin())
  or organization_id in (
    select org_id from public.fn_user_org_ids() org_id
    where public.fn_user_role_in_org(org_id) in ('viewer', 'manager', 'admin')
  )
  or public.fn_can_view_lead(organization_id, owner_user_id)
);

-- O relatório consulta os leads pela RLS e aplicava a mesma função uma segunda
-- vez por atividade. Conserva a existência e a visibilidade do lead original.
drop policy if exists "crm_lead_activities_select" on public.crm_lead_activities;
create policy "crm_lead_activities_select" on public.crm_lead_activities for select using (
  exists (
    select 1 from public.crm_leads l
    where l.id = crm_lead_activities.lead_id
      and (
        (select public.fn_is_platform_admin())
        or l.organization_id in (
          select org_id from public.fn_user_org_ids() org_id
          where public.fn_user_role_in_org(org_id) in ('viewer', 'manager', 'admin')
        )
        or public.fn_can_view_lead(l.organization_id, l.owner_user_id)
      )
  )
);
