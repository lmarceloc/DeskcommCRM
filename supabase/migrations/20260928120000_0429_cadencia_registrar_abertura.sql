-- 0429 — INCREMENTO ATÔMICO DE ABERTURA DE CADÊNCIA
--
-- O pixel de rastreio (`app/api/v1/webhooks/cadencia-pixel/[token]`) roda como
-- service_role, sem sessão de usuário — o cliente de e-mail do LEAD é quem
-- carrega essa URL, nunca um usuário do CRM. Um `select` seguido de `update`
-- pelo supabase-js perderia contagem em aberturas simultâneas (mesmo e-mail
-- aberto no celular e no desktop quase ao mesmo tempo); esta função faz a
-- soma dentro de uma única instrução, atômica por natureza do UPDATE.
--
-- Não é `security definer`: quem chama já É o service_role (bypassa RLS por
-- natureza), então não há elevação de privilégio para conceder. Mesmo assim
-- ela nasce exposta a `anon`/`authenticated` pelo default do schema — os dois
-- `revoke` abaixo cobrem as duas origens de EXECUTE, doutrina de migrations.
create or replace function public.fn_cadencia_registrar_abertura(
  p_enrollment_id uuid,
  p_organization_id uuid
) returns void
language sql
as $$
  update public.email_cadence_enrollments
  set
    aberturas = aberturas + 1,
    primeira_abertura_em = coalesce(primeira_abertura_em, now()),
    ultima_abertura_em = now()
  where id = p_enrollment_id
    and organization_id = p_organization_id;
$$;

revoke execute on function public.fn_cadencia_registrar_abertura(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_cadencia_registrar_abertura(uuid, uuid) to service_role;
