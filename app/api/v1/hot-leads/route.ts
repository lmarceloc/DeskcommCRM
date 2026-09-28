/**
 * GET /api/v1/hot-leads — leads que abriram o MESMO e-mail de uma cadência
 * `LIMIAR_LEAD_QUENTE` vezes ou mais. `agent`+ (é o vendedor quem trabalha
 * esta lista, mesmo corte de quem inscreve lead em cadência).
 *
 * Fonte do dado: `email_cadence_enrollments.aberturas`, que só sobe quando o
 * pixel de rastreio é carregado (`webhooks/cadencia-pixel`) — sem envio real
 * (worker desligado, ou cadência ainda em rascunho), esta lista fica vazia,
 * e é a verdade: ninguém abriu nada ainda.
 *
 * Sessão do usuário, não admin client: a RLS de `email_cadence_enrollments`/
 * `crm_leads`/`contacts` já decide o que este papel enxerga — não há regra de
 * escopo própria a duplicar aqui.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { LIMIAR_LEAD_QUENTE } from "@/lib/cadencias/hot-leads";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface LinhaBruta {
  id: string;
  cadence_id: string;
  lead_id: string;
  aberturas: number;
  primeira_abertura_em: string | null;
  ultima_abertura_em: string | null;
  status: string;
  email_cadences: { name: string } | { name: string }[] | null;
  crm_leads:
    | { title: string; status: string; owner_user_id: string | null; pipeline_id: string }
    | { title: string; status: string; owner_user_id: string | null; pipeline_id: string }[]
    | null;
  contacts: { name: string | null; display_name: string | null } | { name: string | null; display_name: string | null }[] | null;
}

// O PostgREST devolve objeto OU array dependendo da versão/config do embed —
// normaliza pra sempre tratar como "pegue o primeiro", nunca dois caminhos no
// chamador.
function primeiro<T>(v: T | T[] | null): T | null {
  if (v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "hot_leads" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 100, 1), 200);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_cadence_enrollments")
    .select(
      "id, cadence_id, lead_id, aberturas, primeira_abertura_em, ultima_abertura_em, status, " +
        "email_cadences:cadence_id(name), crm_leads:lead_id(title, status, owner_user_id, pipeline_id), " +
        "contacts:contact_id(name, display_name)",
    )
    .eq("organization_id", authz.org.orgId)
    .gte("aberturas", LIMIAR_LEAD_QUENTE)
    .order("aberturas", { ascending: false })
    .order("ultima_abertura_em", { ascending: false })
    .limit(limit);

  if (error) return fail("internal_error", t("Erro ao listar leads quentes."), 500, { requestId });

  const linhas = (data ?? []) as unknown as LinhaBruta[];
  const items = linhas.map((l) => {
    const cadencia = primeiro(l.email_cadences);
    const lead = primeiro(l.crm_leads);
    const contato = primeiro(l.contacts);
    return {
      enrollment_id: l.id,
      cadence_id: l.cadence_id,
      cadence_name: cadencia?.name ?? null,
      lead_id: l.lead_id,
      lead_title: lead?.title ?? null,
      lead_status: lead?.status ?? null,
      pipeline_id: lead?.pipeline_id ?? null,
      owner_user_id: lead?.owner_user_id ?? null,
      contact_name: nomeDoContato(contato),
      aberturas: l.aberturas,
      primeira_abertura_em: l.primeira_abertura_em,
      ultima_abertura_em: l.ultima_abertura_em,
      inscricao_status: l.status,
    };
  });

  return ok(items, { requestId, meta: { total: items.length } });
}
