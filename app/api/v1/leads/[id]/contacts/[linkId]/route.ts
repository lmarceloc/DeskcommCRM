/**
 * DELETE /api/v1/leads/:id/contacts/:linkId — desvincula (nunca apaga o
 * contato em si, só a linha de vínculo em `crm_lead_contacts`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; linkId: string }> },
): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_contacts" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id: leadId, linkId } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lead_contacts")
    .delete()
    .eq("organization_id", org.orgId)
    .eq("lead_id", leadId)
    .eq("id", linkId)
    .select("id, contact_id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Vínculo não encontrado."), 404, { requestId });

  void audit({
    action: "lead.contact_unlinked",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_lead_contacts",
    resourceId: linkId,
    requestId,
    metadata: { lead_id: leadId, contact_id: (data as { contact_id: string }).contact_id },
  });

  return ok({ removido: true }, { requestId });
}
