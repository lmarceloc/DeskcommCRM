/**
 * GET  /api/v1/companies — a lista, para o seletor "Empresa" do negócio.
 * POST /api/v1/companies — cria (o form do dossiê cria na hora, sem sair da tela).
 *
 * `agent`+: escolher/criar a empresa do negócio é gesto de quem vende, não só
 * de quem administra — mesmo corte de `crm_leads` (spec 13 §4).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createCompanySchema, listCompaniesSchema } from "@/lib/schemas/companies";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS = "id, name, website, linkedin_url, created_at, updated_at";

function codificarCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify(row)).toString("base64url");
}
function decodificarCursor(cursor: string): { created_at: string; id: string } | null {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return typeof v?.created_at === "string" && typeof v?.id === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_companies" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = listCompaniesSchema.safeParse(params);
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, { requestId, details: parsed.error.flatten() });
  }
  const q = parsed.data;

  const supabase = await createClient();
  let query = supabase
    .from("crm_companies")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(q.limit + 1);

  if (q.q) query = query.ilike("name", `%${q.q}%`);
  if (q.cursor) {
    const c = decodificarCursor(q.cursor);
    if (!c) return fail("invalid_cursor", t("Cursor inválido."), 400, { requestId });
    query = query.or(`created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id})`);
  }

  const { data, error } = await query;
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const linhas = data ?? [];
  const temMais = linhas.length > q.limit;
  const pagina = temMais ? linhas.slice(0, q.limit) : linhas;
  const ultima = pagina[pagina.length - 1] as { created_at: string; id: string } | undefined;

  return ok(pagina, {
    requestId,
    meta: { cursor: temMais && ultima ? codificarCursor(ultima) : null, has_more: temMais },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_companies" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const parsed = createCompanySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const entrada = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_companies")
    .insert({
      organization_id: org.orgId,
      name: entrada.name,
      website: entrada.website ?? null,
      linkedin_url: entrada.linkedin_url ?? null,
      created_by_user_id: user.id,
    })
    .select(COLUNAS)
    .single();
  if (error || !data) {
    return fail("internal_error", error?.message ?? t("Não foi possível criar a empresa."), 500, { requestId });
  }

  const criada = data as unknown as { id: string };
  void audit({
    action: "company.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_company",
    resourceId: criada.id,
    requestId,
  });

  return ok(data, { requestId, status: 201 });
}
