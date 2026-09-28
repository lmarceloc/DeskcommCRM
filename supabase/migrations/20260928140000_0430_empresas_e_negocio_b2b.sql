-- 0430 — EMPRESAS, MÚLTIPLOS CONTATOS POR NEGÓCIO, TERMÔMETRO E PRODUTO
--
-- ⚠️ NÚMERO PROVISÓRIO: esta branch nasceu ao lado de outra (cadências de
-- e-mail, PR #2) que também reserva um NNNN. Se aquele PR mesclar primeiro
-- com um número diferente do que esta migration prevê como "livre", renumere
-- esta ANTES de abrir o PR — `pnpm checar:colisao-de-migration` mede contra
-- a `main` do momento.
--
-- ═══ O que nasce aqui ═══
--
--   * `crm_companies` — a empresa do lead, hoje inexistente no schema. Nome,
--     site, LinkedIn. Decisão do dono do produto: tabela PRÓPRIA, não um
--     campo solto em `contacts` — várias pessoas (contatos) podem pertencer à
--     mesma empresa, e várias oportunidades (negócios) podem mirar a mesma
--     empresa ao longo do tempo.
--   * `crm_lead_contacts` — negócio ↔ contato, N:N. `crm_leads.contact_id`
--     CONTINUA sendo o contato PRINCIPAL (é dele que vem o remetente do
--     WhatsApp, a inscrição em cadência de e-mail, etc. — nada que já
--     existe muda). Esta tabela é para os OUTROS stakeholders do mesmo
--     negócio B2B (o financeiro, o técnico, quem assina) — gente que
--     participa da negociação sem ser "o contato" do card.
--   * `crm_leads.company_id` — a empresa do negócio.
--   * `crm_leads.thermometer` — temperatura de interesse, SEPARADA da etapa
--     do funil (decisão do dono do produto): a etapa é onde o processo está
--     ("proposta enviada"), o termômetro é o quanto a pessoa parece querer
--     comprar ("morno"). Um negócio pode estar em "Proposta" e "frio" ao
--     mesmo tempo — são duas perguntas diferentes.
--   * `crm_leads.product_id` — aponta pro catálogo que já existe
--     (`catalog_products`, migration 0208), em vez de nascer um campo de
--     texto solto que divergiria do que a loja realmente vende (DIRC:
--     Integrar, não Duplicar).
--   * `contacts.linkedin_url`, `contacts.job_title` — dado de contato B2B que
--     a ficha da pessoa ainda não tinha.
--
-- ═══ Por que NÃO existe `crm_leads.contact_id` → `crm_lead_contacts`
--     migração de dado ═══
--
-- Duplicar o contato principal também na tabela de vínculo criaria DOIS
-- lugares afirmando "este contato está neste negócio", e um dia divergem
-- (removido do vínculo, continua sendo o principal — ou o oposto). A tela
-- mostra "Contato principal" (de `crm_leads.contact_id`) e "Outros contatos"
-- (de `crm_lead_contacts`) como duas seções, nunca uma lista só.
--
-- ═══ LGPD ═══
--
-- `crm_lead_contacts` não duplica NENHUM dado pessoal — só o vínculo (dois
-- uuids). A cascata de anonimização de um contato não precisa de trigger novo
-- aqui: `on delete cascade` em `contact_id` já remove o vínculo quando o
-- contato é apagado, e anonimizar não apaga a linha (mesmo comportamento de
-- qualquer outra referência a `contacts.id`).

create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  website text,
  linkedin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  constraint crm_companies_name_check check (btrim(name) <> '')
);

create index if not exists idx_crm_companies_org_name
  on public.crm_companies (organization_id, name);

comment on table public.crm_companies is
  'Empresa vinculada a negócios e contatos B2B (migration 0430). Não confundir com organizations (o tenant do produto).';

alter table public.crm_companies enable row level security;

drop policy if exists tenant_isolation_crm_companies_all on public.crm_companies;
create policy tenant_isolation_crm_companies_all on public.crm_companies
  for all using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  )
  with check (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- crm_leads: empresa, termômetro, produto — todas nullable, nada muda em
-- negócio existente até alguém preencher.
alter table public.crm_leads
  add column if not exists company_id uuid references public.crm_companies(id) on delete set null;

alter table public.crm_leads
  add column if not exists thermometer text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_leads_thermometer_check'
      and conrelid = 'public.crm_leads'::regclass
  ) then
    alter table public.crm_leads
      add constraint crm_leads_thermometer_check
      check (thermometer is null or thermometer in ('sem_interesse', 'frio', 'morno', 'quente', 'quase_fechando'));
  end if;
end $$;

alter table public.crm_leads
  add column if not exists product_id uuid references public.catalog_products(id) on delete set null;

create index if not exists idx_crm_leads_company on public.crm_leads (company_id) where company_id is not null;

-- crm_lead_contacts: outros contatos do mesmo negócio, além do principal.
create table if not exists public.crm_lead_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  constraint crm_lead_contacts_unica unique (lead_id, contact_id)
);

create index if not exists idx_crm_lead_contacts_lead on public.crm_lead_contacts (lead_id);
create index if not exists idx_crm_lead_contacts_contact on public.crm_lead_contacts (contact_id);

comment on table public.crm_lead_contacts is
  'Outros stakeholders do negócio B2B, além do contato principal (crm_leads.contact_id). Migration 0430.';

alter table public.crm_lead_contacts enable row level security;

drop policy if exists tenant_isolation_crm_lead_contacts_all on public.crm_lead_contacts;
create policy tenant_isolation_crm_lead_contacts_all on public.crm_lead_contacts
  for all using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  )
  with check (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- contacts: LinkedIn e cargo — dado de contato B2B.
alter table public.contacts
  add column if not exists linkedin_url text;

alter table public.contacts
  add column if not exists job_title text;
