-- ============================================================================
-- 0429 — ANEXOS DO NEGÓCIO (arquivo no Deal, com link permanente pro cliente)
--
-- Pedido do dono do produto: subir PDF/JPEG/PNG/Word num negócio (proposta,
-- contrato, orçamento) e mandar pro cliente só o LINK — nunca o arquivo em si
-- pelo WhatsApp.
--
-- ─── Por que TABELA, e não um array de caminhos (ao contrário da 0390)
--
-- A 0390 (fotos do produto) usa `text[]` porque a única coisa que a tela faz
-- com uma foto é pôr/tirar/reordenar, e a ordem já é a do array. Um anexo tem
-- METADADO PRÓPRIO que a tela precisa mostrar sem baixar o arquivo — nome
-- original, tipo, tamanho, quem subiu, quando — e isso é coluna, não caber
-- dentro de um caminho de Storage. Tabela também dá um `id` PRÓPRIO e
-- estável para o link público (abaixo), que um índice de array não daria.
--
-- ─── Por que bucket PRÓPRIO, privado, sem policy em storage.objects
--
-- `deal-attachments`, não `whatsapp-media`: o anexo é do NEGÓCIO, não de uma
-- conversa nem de um contato — a limpeza de LGPD de conversa/contato não deve
-- arrastar a proposta que o vendedor anexou. Sem policy em `storage.objects`
-- (molde do `catalog-photos`, 0390): só o `service_role` lê e grava, depois de
-- a rota conferir papel e organização — a autorização mora no Postgres, não no
-- Storage.
--
-- ─── O link permanente (decisão do dono do produto: nunca expira)
--
-- `GET /api/v1/anexos/{id}` é rota PÚBLICA (sem cookie de sessão — quem abre é
-- o CLIENTE, que não tem conta) que resolve o anexo pelo `id` (uuid v4, 122
-- bits, não adivinhável), assina uma URL CURTA do Storage a cada acesso e
-- redireciona. O link que o vendedor manda é sempre `/api/v1/anexos/{id}` — ele
-- não expira porque não é ele que aponta pro arquivo, é a assinatura por trás,
-- renovada a cada clique. Apagar o anexo (o `id` some) é o único jeito de
-- revogar o link.
--
-- 20 MB: mesmo teto de `app/api/v1/ai/knowledge/sources/upload` — maior que o
-- de imagem (5 MB) porque PDF/Word de proposta comercial passa fácil de 5 MB.
-- SVG fica de fora da lista de tipos aceitos pelo mesmo motivo do logo
-- (`lib/branding/logo-arquivo.ts`): é XML com `<script>` executável e este
-- repo não tem CSP — servido do bucket, executaria no origin do Storage.
--
-- RLS: SELECT usa `fn_can_view_lead` (o mesmo respeito a `visibility_mode` da
-- 0071/0044) — quem não pode ver o negócio não vê o anexo dele. Sem UPDATE:
-- anexo não se edita, só se sobe outro ou se apaga.
--
-- Idempotente: `create table if not exists`, constraints recriadas, bucket com
-- `on conflict do update`. Aditiva.
-- ============================================================================

create table if not exists public.crm_lead_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  -- Caminho em storage/deal-attachments, sempre <organization_id>/<lead_id>/<este id>.<ext>.
  storage_path text not null,
  -- Nome ORIGINAL do arquivo (o que a pessoa via no computador dela) — o
  -- caminho no bucket é o id, não o nome, então sem esta coluna a tela e o
  -- link de download mostrariam um uuid.
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_lead_attachments_file_name_nao_vazio check (btrim(file_name) <> ''),
  constraint crm_lead_attachments_tamanho_positivo check (size_bytes > 0),
  constraint crm_lead_attachments_tipo_check check (mime_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ))
);

create index if not exists idx_crm_lead_attachments_negocio
  on public.crm_lead_attachments (lead_id, created_at desc);
create index if not exists idx_crm_lead_attachments_org
  on public.crm_lead_attachments (organization_id, created_at desc);

comment on table public.crm_lead_attachments is
  'Arquivo anexado a um negócio (proposta, contrato, orçamento). Caminho em storage/deal-attachments. Link público permanente em GET /api/v1/anexos/{id}.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-attachments', 'deal-attachments', false, 20971520,
  array[
    'application/pdf', 'image/jpeg', 'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ═══ RLS ═══
alter table public.crm_lead_attachments enable row level security;

drop policy if exists "crm_lead_attachments_select" on public.crm_lead_attachments;
drop policy if exists "crm_lead_attachments_insert" on public.crm_lead_attachments;
drop policy if exists "crm_lead_attachments_delete" on public.crm_lead_attachments;

create policy "crm_lead_attachments_select" on public.crm_lead_attachments
  for select using (
    exists (
      select 1 from public.crm_leads l
      where l.id = crm_lead_attachments.lead_id
        and public.fn_can_view_lead(l.organization_id, l.owner_user_id)
    )
  );

-- Defesa em profundidade: quem escreve de verdade é o service_role (a rota
-- confere `requireRole("agent")` e o lead pertence à organização), que
-- bypassa RLS. As policies abaixo cobrem o caso de alguém falar direto com o
-- PostgREST usando sessão própria.
create policy "crm_lead_attachments_insert" on public.crm_lead_attachments
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "crm_lead_attachments_delete" on public.crm_lead_attachments
  for delete using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

revoke all on public.crm_lead_attachments from anon, authenticated;
grant select, insert, delete on public.crm_lead_attachments to authenticated;
grant all on public.crm_lead_attachments to service_role;
