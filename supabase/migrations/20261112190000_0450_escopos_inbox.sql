-- Calcula o alcance por organização uma vez por consulta, inclusive para agent.
-- O resultado contém apenas organizações do usuário/suporte ativo, nunca dados
-- de contatos. A função original continua sendo a referência de equivalência.
create or replace function public.fn_escopos_leitura_inbox()
returns table (org_id uuid, acesso_total boolean, fila boolean)
language sql stable security definer set search_path = public as $f$
  select o.id,
    r.papel in ('viewer','manager','admin') or coalesce(o.settings->>'visibility_mode','own_and_unassigned')='all',
    coalesce(o.settings->>'visibility_mode','own_and_unassigned')='own_and_unassigned'
  from public.organizations o
  join (select id as org_id, public.fn_user_role_in_org(id) as papel from public.fn_user_org_ids() as id) r on r.org_id=o.id
  where r.papel is not null;
$f$;
revoke all on function public.fn_escopos_leitura_inbox() from public, anon;
grant execute on function public.fn_escopos_leitura_inbox() to authenticated, service_role;

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations for select using (
  (select public.fn_is_platform_admin())
  or organization_id in (select org_id from public.fn_escopos_leitura_inbox() where acesso_total)
  or (assigned_to_user_id = (select auth.uid()) and organization_id in (select org_id from public.fn_escopos_leitura_inbox()))
  or (assigned_to_user_id is null and organization_id in (select org_id from public.fn_escopos_leitura_inbox() where fila))
);
