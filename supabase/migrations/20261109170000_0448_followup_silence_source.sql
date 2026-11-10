-- Um disparo de silêncio por fluxo e mensagem recebida, inclusive após cancelamento.
-- NULL preserva os registros antigos e os produtores que não são de silêncio.
alter table public.followup_enrollments
  add column if not exists silence_source_message_id uuid;

create unique index if not exists idx_followup_silence_source_once
  on public.followup_enrollments (organization_id, pointer_id, silence_source_message_id)
  where silence_source_message_id is not null;
