-- Migration 0431: trava diária de envio de e-mail de cadência.
--
-- O transporte de e-mail é ÚNICO por instalação (lib/email/roteador.ts — SMTP
-- se configurado, senão Resend): é a MESMA caixa/conta que leva o volume de
-- TODAS as organizações do clone. Provedor de e-mail bane ou trava a caixa
-- que manda volume alto de uma vez — pedido do dono do produto depois de uma
-- caixa real ter sido banida assim. `lib/cadencias/worker.ts` passa a checar
-- `CADENCIA_LIMITE_EMAILS_POR_DIA` (padrão 60, `lib/env.ts`) antes de cada
-- envio, via `checkRateLimit` (Upstash Redis, mesmo mecanismo do resto do
-- produto) — não requer tabela nova.
--
-- Esta migration só amplia o VOCABULÁRIO de `email_cadence_events.tipo`, pra
-- o worker poder registrar (`limite_diario_atingido`) quando uma inscrição é
-- adiada por causa da trava — sem isso, o evento não teria como existir sem
-- violar o CHECK, e a trava ficaria muda: ninguém saberia PELA TELA (aba
-- Atividade / linha do tempo da cadência) por que um e-mail atrasou.
--
-- Só ADICIONA valor — nenhum evento existente muda de tipo, então não há
-- dado pra corrigir antes do novo CHECK.

alter table public.email_cadence_events
  drop constraint if exists email_cadence_events_tipo_check;

alter table public.email_cadence_events
  add constraint email_cadence_events_tipo_check check (tipo in (
    'inscrito','reinscrito','email_enviado','email_falhou','aberto','clicado',
    'descadastrou','ramo_sim','ramo_nao','tarefa_criada','parada','concluida',
    'limite_diario_atingido'
  ));
