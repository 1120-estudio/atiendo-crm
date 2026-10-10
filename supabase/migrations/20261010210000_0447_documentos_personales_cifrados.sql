-- ---- Cifra de documentos pessoais (migration 0447) ----
-- A chave é passada SOMENTE pelo backend; não é gravada no banco nem retornada.
-- Mantém pgp_sym AES-256 e o par hash/cifra exigido por contacts_cpf_consistency.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.encrypt_cpf(p_plaintext text, p_key text)
returns bytea language plpgsql security invoker
set search_path = public, extensions, pg_temp as $$
begin
  if p_key is null or length(p_key) < 32 then
    raise exception 'document_encryption_key_invalid' using errcode = '22023';
  end if;
  if p_plaintext is null or length(p_plaintext) not between 1 and 96 then
    raise exception 'document_invalid' using errcode = '22023';
  end if;
  return pgp_sym_encrypt(p_plaintext, p_key, 'cipher-algo=aes256');
end;
$$;

create or replace function public.decrypt_cpf(p_contact_id uuid, p_key text)
returns text language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_cipher bytea;
begin
  -- O papel é revalidado no banco. Um ID de outro tenant nunca devolve cifra.
  select c.cpf_encrypted into v_cipher from public.contacts c
  join public.user_organizations u on u.organization_id = c.organization_id
  where c.id = p_contact_id and u.user_id = auth.uid()
    and u.revoked_at is null and u.accepted_at is not null
    and u.role in ('manager', 'admin');
  if not found then
    raise exception 'document_access_denied' using errcode = '42501';
  end if;
  if p_key is null or length(p_key) < 32 then
    raise exception 'document_encryption_key_invalid' using errcode = '22023';
  end if;
  if v_cipher is null then return null; end if;
  return pgp_sym_decrypt(v_cipher, p_key);
end;
$$;

revoke all on function public.encrypt_cpf(text, text) from public, anon, authenticated, service_role;
revoke all on function public.decrypt_cpf(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.encrypt_cpf(text, text) to authenticated, service_role;
-- O cliente de sessão preserva auth.uid(); service_role não ganha uma porta de leitura.
grant execute on function public.decrypt_cpf(uuid, text) to authenticated;
notify pgrst, 'reload schema';
