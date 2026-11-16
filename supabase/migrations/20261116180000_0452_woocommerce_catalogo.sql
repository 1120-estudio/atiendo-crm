-- WooCommerce is opt-in per organization; existing catalogue rows are preserved.
create table if not exists public.woocommerce_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid() unique,
  url text not null,
  credentials_enc text not null,
  webhook_enc text not null,
  enabled boolean not null default true,
  preservar_conteudo boolean not null default true,
  page integer not null default 1,
  cycle_started_at timestamptz not null default now(),
  next_run_at timestamptz not null default now(),
  lease_until timestamptz,
  last_success_at timestamptz,
  last_error text,
  processed integer not null default 0,
  check (page > 0)
);
alter table public.woocommerce_connections enable row level security;
-- Secrets are only accessible through guarded server routes, never PostgREST clients.
revoke all on public.woocommerce_connections from public, anon, authenticated;
grant all on public.woocommerce_connections to service_role;

alter table public.catalog_products add column if not exists woo_id bigint;
alter table public.catalog_products add column if not exists woo_parent_id bigint;
alter table public.catalog_products add column if not exists woo_disponivel boolean;
alter table public.catalog_products add column if not exists woo_seen_at timestamptz;
alter table public.catalog_products add column if not exists ficha_woocommerce jsonb;
create unique index if not exists catalog_products_woo_identity on public.catalog_products(organization_id, woo_id) where woo_id is not null;

alter table public.catalog_products drop constraint if exists catalog_products_fotos_no_maximo_5;
-- No fixed gallery count: per-file size limits and batched imports bound memory.
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'catalog-photos';

create or replace function public.fn_claim_woocommerce(p_org uuid, p_token timestamptz)
returns boolean language sql security definer set search_path = public as $$
  with claimed as (
    update public.woocommerce_connections set lease_until = p_token
    where organization_id = p_org and enabled and next_run_at <= now()
      and (lease_until is null or lease_until < now()) returning 1
  ) select exists(select 1 from claimed);
$$;
revoke execute on function public.fn_claim_woocommerce(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.fn_claim_woocommerce(uuid,timestamptz) to service_role;
