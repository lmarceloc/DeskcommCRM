/**
 * GET/PATCH /api/v1/companies/:id — a empresa (ficha simples: nome, site, LinkedIn).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { updateCompanySchema } from "@/lib/schemas/companies";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS = "id, name, website, linkedin_url, created_at, updated_at";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_companies" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_companies")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return fail("not_found", t("Empresa não encontrada."), 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_companies" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await ctx.params;

  const parsed = updateCompanySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const entrada = parsed.data;
  const mudanca: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (entrada.name !== undefined) mudanca.name = entrada.name;
  if (entrada.website !== undefined) mudanca.website = entrada.website;
  if (entrada.linkedin_url !== undefined) mudanca.linkedin_url = entrada.linkedin_url;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_companies")
    .update(mudanca)
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .select(COLUNAS)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Empresa não encontrada."), 404, { requestId });

  void audit({
    action: "company.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_company",
    resourceId: id,
    requestId,
  });

  return ok(data, { requestId });
}
