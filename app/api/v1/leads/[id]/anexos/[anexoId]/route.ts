/**
 * DELETE /api/v1/leads/:id/anexos/:anexoId — apaga o anexo (linha + arquivo).
 *
 * É o ÚNICO jeito de revogar o link público (`GET /api/v1/anexos/{id}`):
 * apagada a linha, a rota pública devolve 404 no próximo acesso.
 */
import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { apagarAnexoDoBucket } from "@/lib/anexos/bucket";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string; anexoId: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_attachments" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id: leadId, anexoId } = await ctx.params;

  const supabase = await createClient();
  const { data: anexo, error: erroSelect } = await supabase
    .from("crm_lead_attachments")
    .select("id, storage_path")
    .eq("id", anexoId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (erroSelect) return fail("internal_error", erroSelect.message, 500, { requestId });
  if (!anexo) return fail("not_found", t("Anexo não encontrado."), 404, { requestId });

  const { storage_path: caminho } = anexo as { storage_path: string };

  const { error: erroDelete } = await supabase
    .from("crm_lead_attachments")
    .delete()
    .eq("id", anexoId)
    .eq("lead_id", leadId);
  if (erroDelete) return fail("internal_error", erroDelete.message, 500, { requestId });

  await apagarAnexoDoBucket(caminho, requestId);

  await audit({
    organizationId: orgId,
    actorUserId: authz.user.id,
    action: "lead.attachment_removed",
    resourceType: "crm_leads",
    resourceId: leadId,
    requestId,
  });

  return ok({ id: anexoId }, { requestId });
}
