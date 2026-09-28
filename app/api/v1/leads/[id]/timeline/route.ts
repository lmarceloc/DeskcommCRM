/**
 * GET /api/v1/leads/[id]/timeline
 *
 * A timeline do NEGÓCIO — irmã da timeline do CONTATO, e não a mesma coisa.
 *
 * POR QUE ESTA ROTA EXISTE: o dossiê usava a timeline do contato, que é
 * indexada por `contact_id`. Lead SEM contato não tinha porta de entrada
 * nenhuma, e o dossiê de um negócio com quatro atividades dizia na tela "Nada
 * aconteceu com este negócio ainda". Medido: 14 de 55 leads sem contato (25%) e
 * 126 de 198 atividades pertencendo a eles (64%) — não é caso de canto, é a
 * maioria do que está registrado.
 *
 * E o defeito não estava NA peça: a timeline do contato está correta sobre o
 * contato. Ela foi reusada como dossiê do negócio, que é outro substantivo.
 * Vazio por falta de EIXO se lê idêntico a vazio por falta de ACONTECIMENTO — e
 * a frase estava na frente do cliente afirmando o que não era verdade.
 *
 * A CLÁUSULA: âncora no lead, unida com `contact_id = <contato do lead> and
 * lead_id is null`.
 *
 *  - o segundo lado NÃO é redundante hoje só porque está vazio: ele preserva a
 *    atividade que nasce da conversa e não de um negócio específico, que é o que
 *    o eixo por contato protegia. Se um dia nascer, ela aparece;
 *  - o irmão fica de fora POR CONSTRUÇÃO: atividade do negócio B tem
 *    `lead_id = B`, e não casa com nenhum dos dois lados. A rota do contato,
 *    por puxar todos os leads dele, somava no dossiê de A o que era de B;
 *  - lead sem contato passa a ter porta com o primeiro lado sozinho.
 *
 * ⚠️ NÃO "SIMPLIFIQUE" O SEGUNDO LADO. Hoje ele casa zero linhas, e é
 * exatamente por isso que parece removível. A escolha NÃO foi feita pela
 * contagem de hoje: contagem responde sobre o que existe, não sobre o que o
 * código permite, e aqui o zero estava dos dois lados do argumento.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser } from "@/lib/auth/server";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import {
  TIMELINE_COLS,
  comNomeDoAtor,
  decodeCursor,
  eixoDoDossie,
  encodeCursor,
} from "@/lib/leads/timeline-query";
import type { TimelineItem } from "@/lib/types/contacts";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id: leadId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const authUser = await loadAuthUser();
  const t = (texto: string) => traduzir(texto, authUser?.idioma ?? "pt-BR");

  const url = new URL(req.url);
  const types = url.searchParams.getAll("type").filter(Boolean);
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) {
    return fail("invalid_cursor", t("Cursor inválido."), 400, { requestId });
  }

  // O lead vem pela RLS do caller — é ele que prova a org, nunca o body.
  const { data: lead, error: leadErr } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return fail("internal_error", leadErr.message, 500, { requestId });
  if (!lead) return fail("not_found", t("Negócio não encontrado."), 404, { requestId });

  const contactId = (lead as { contact_id: string | null }).contact_id;

  let q = supabase
    .from("crm_lead_activities")
    .select(TIMELINE_COLS)
    .order("performed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // A cláusula mora em `eixoDoDossie` — não aqui — porque é ela que o teste
  // prende. Sem contato ela devolve null e o filtro vira igualdade simples: é
  // isso que dá porta ao lead que antes não tinha nenhuma.
  const eixo = eixoDoDossie(leadId, contactId);
  q = eixo ? q.or(eixo) : q.eq("lead_id", leadId);

  if (types.length > 0) q = q.in("type", types);
  if (cursor) {
    q = q.or(
      `performed_at.lt.${cursor.performed_at},and(performed_at.eq.${cursor.performed_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const rows = (data ?? []) as unknown as TimelineItem[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const page = await comNomeDoAtor(supabase, pageRows);
  const last = pageRows[pageRows.length - 1];

  return ok(page, {
    requestId,
    meta: {
      has_more: hasMore,
      cursor: hasMore && last ? encodeCursor({ performed_at: last.performed_at, id: last.id }) : null,
    },
  });
}

const criarNotaSchema = z.object({
  /**
   * O texto da nota. `@Nome Sobrenome` fica em texto puro — a tela é quem
   * destaca a menção comparando com os membros da organização (decisão do
   * dono do produto: só visual por enquanto, sem notificar quem foi citado).
   */
  texto: z.string().trim().min(1).max(4000),
});

/**
 * POST /api/v1/leads/[id]/timeline — anotação manual no negócio.
 *
 * `agent`+: registrar o que aconteceu na negociação é gesto de quem atende,
 * não só de quem administra. O texto vai para `reason` — para uma NOTA
 * (diferente de `lead_edited`), o texto É o dado que a pessoa quis guardar,
 * não um resumo do que mudou; a restrição de "nomear campo, nunca valor" do
 * `§9` é sobre timeline AUTOMÁTICA, não sobre o que um humano escreveu à mão.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_activities" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id: leadId } = await ctx.params;

  const parsed = criarNotaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Escreva o texto da anotação."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data: lead, error: leadErr } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return fail("internal_error", leadErr.message, 500, { requestId });
  if (!lead) return fail("not_found", t("Negócio não encontrado."), 404, { requestId });

  const resultado = await emitLeadActivity(supabase, {
    organizationId: authz.org.orgId,
    leadId,
    contactId: (lead as { contact_id: string | null }).contact_id,
    type: "note",
    sourceModule: "crm",
    sourceId: null,
    actor: { type: "user", id: authz.user.id },
    reason: parsed.data.texto,
  });
  if (!resultado.ok) {
    return fail("internal_error", resultado.error ?? t("Não foi possível salvar a anotação."), 500, { requestId });
  }

  void audit({
    action: "lead.note_added",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_lead_activities",
    resourceId: leadId,
    requestId,
  });

  return ok({ criado: true }, { requestId, status: 201 });
}
