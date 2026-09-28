/**
 * GET  /api/v1/leads/:id/contacts — os OUTROS contatos deste negócio (além do
 *      principal, `crm_leads.contact_id` — ver migration 0430).
 * POST /api/v1/leads/:id/contacts — vincula um contato existente ao negócio.
 *
 * `agent`+, mesmo corte de editar o negócio.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const vincularSchema = z.object({ contact_id: z.string().uuid() });

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_contacts" });
  if (!authz.ok) return authz.response;
  const { id: leadId } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lead_contacts")
    .select("id, contact_id, created_at, contacts:contact_id(id, name, display_name, email, phone_number, job_title)")
    .eq("organization_id", authz.org.orgId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(data ?? [], { requestId });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_contacts" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id: leadId } = await ctx.params;

  const parsed = vincularSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const { contact_id } = parsed.data;

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return fail("not_found", t("Negócio não encontrado."), 404, { requestId });

  const { data: contato } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("id", contact_id)
    .maybeSingle();
  if (!contato) return fail("not_found", t("Contato não encontrado."), 404, { requestId });

  const { data, error } = await supabase
    .from("crm_lead_contacts")
    .insert({ organization_id: org.orgId, lead_id: leadId, contact_id, created_by_user_id: user.id })
    .select("id, contact_id, created_at")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return fail("state_conflict", t("Este contato já está vinculado a este negócio."), 409, { requestId });
    }
    return fail("internal_error", error.message, 500, { requestId });
  }

  void audit({
    action: "lead.contact_linked",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_lead_contacts",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { lead_id: leadId, contact_id },
  });

  return ok(data, { requestId, status: 201 });
}
