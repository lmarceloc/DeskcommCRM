/**
 * GET  /api/v1/leads/:id/anexos — lista os anexos do negócio.
 * POST /api/v1/leads/:id/anexos — sobe UM anexo (multipart `file`).
 *
 * Pedido do dono do produto: anexar proposta/contrato/orçamento ao negócio e
 * mandar pro cliente só o LINK — nunca o arquivo pelo WhatsApp. O link é
 * `GET /api/v1/anexos/{id}` (rota pública, `app/api/v1/anexos/[id]/route.ts`).
 *
 * O arquivo vai para `deal-attachments` pelo service role (o bucket não tem
 * policy nenhuma); é o `requireRole("agent")` daqui que autoriza. O caminho é
 * gerado AQUI, nunca aceito do cliente. Regras e tetos em `lib/anexos/tipos.ts`.
 */
import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  BUCKET_DE_ANEXOS,
  extensaoDoAnexo,
  farejarTipoDoAnexo,
  TAMANHO_MAXIMO_DO_ANEXO,
} from "@/lib/anexos/tipos";
import { apagarAnexoDoBucket } from "@/lib/anexos/bucket";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/** O negócio existe NESTA organização? A leitura passa pela RLS do caller. */
async function negocioExiste(leadId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("crm_leads").select("id").eq("id", leadId).maybeSingle();
  return data !== null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_lead_attachments" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id: leadId } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lead_attachments")
    .select("id, file_name, mime_type, size_bytes, uploaded_by, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (data === null) return fail("not_found", t("Negócio não encontrado."), 404, { requestId });

  return ok(data, { requestId });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_attachments" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id: leadId } = await ctx.params;

  if (!(await negocioExiste(leadId))) {
    return fail("not_found", t("Negócio não encontrado."), 404, { requestId });
  }

  // Recusa pelo Content-Length declarado ANTES de bufferizar o corpo; file.size
  // abaixo continua sendo o check autoritativo.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAXIMO_DO_ANEXO + 1_048_576) {
    return fail("payload_too_large", t("O arquivo precisa ter até 20 MB."), 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });
  }
  if (file.size > TAMANHO_MAXIMO_DO_ANEXO) {
    return fail("payload_too_large", t("O arquivo precisa ter até 20 MB."), 413, { requestId });
  }
  const nomeOriginal = (form?.get("file_name") as string | null)?.trim() || file.name || "arquivo";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const tipo = farejarTipoDoAnexo(bytes);
  if (!tipo) {
    return fail(
      "unsupported_media_type",
      t("O arquivo precisa ser PDF, JPEG, PNG ou Word (.doc/.docx)."),
      415,
      { requestId, details: { content_type_declarado: file.type || null } },
    );
  }

  const id = randomUUID();
  const caminho = `${orgId}/${leadId}/${id}.${extensaoDoAnexo(tipo)}`;
  const { error: erroUp } = await createAdminClient()
    .storage.from(BUCKET_DE_ANEXOS)
    .upload(caminho, bytes, { contentType: tipo, upsert: false });
  if (erroUp) {
    logger.error("[anexos] upload falhou", { detalhe: erroUp.message, requestId });
    return fail("internal_error", t("Erro ao subir o arquivo."), 500, { requestId });
  }

  const supabase = await createClient();
  const { data: linha, error: erroInsert } = await supabase
    .from("crm_lead_attachments")
    .insert({
      id,
      organization_id: orgId,
      lead_id: leadId,
      storage_path: caminho,
      file_name: nomeOriginal.slice(0, 300),
      mime_type: tipo,
      size_bytes: file.size,
      uploaded_by: authz.user.id,
    })
    .select("id, file_name, mime_type, size_bytes, uploaded_by, created_at")
    .single();

  if (erroInsert || !linha) {
    await apagarAnexoDoBucket(caminho, requestId);
    logger.error("[anexos] gravação da linha falhou", { detalhe: erroInsert?.message, requestId });
    return fail("internal_error", t("Erro ao salvar o anexo."), 500, { requestId });
  }

  await audit({
    organizationId: orgId,
    actorUserId: authz.user.id,
    action: "lead.attachment_added",
    resourceType: "crm_leads",
    resourceId: leadId,
    requestId,
  });

  return ok(linha, { requestId });
}
