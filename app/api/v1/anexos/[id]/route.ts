/**
 * GET /api/v1/anexos/{id} — o LINK PERMANENTE que o vendedor manda pro cliente.
 *
 * Rota PÚBLICA (sem cookie de sessão — `lib/auth/public-paths.ts`): quem abre
 * é o CLIENTE, que não tem conta no CRM. A autorização não é sessão nem
 * organização ativa — é o `id` em si, um uuid v4 (122 bits de aleatoriedade,
 * não adivinhável), o mesmo desenho de `lib/catalogo/fotos.ts` (caminho como
 * capacidade).
 *
 * O bucket `deal-attachments` é PRIVADO, então a rota assina uma URL CURTA a
 * cada acesso e redireciona — exatamente como
 * `app/api/v1/contacts/[id]/avatar/route.ts`, mas SEM `loadAuthUser`/
 * `resolveActiveOrg`, porque aqui não há sessão para resolver.
 *
 * O LINK EM SI NUNCA EXPIRA: quem expira é a assinatura por trás, renovada a
 * cada clique. Apagar o anexo (`DELETE /api/v1/leads/:id/anexos/:anexoId`) é
 * o único jeito de revogar — a partir daí a linha some e esta rota passa a
 * devolver 404.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { BUCKET_DE_ANEXOS } from "@/lib/anexos/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Vida da URL assinada. Curta de propósito: se vazar (log de proxy, histórico do navegador), expira sozinha. */
const SIGNED_TTL_SECONDS = 300;

/**
 * Quanto o browser guarda o próprio redirect — menor que `SIGNED_TTL_SECONDS`
 * pela mesma folga de `contacts/[id]/avatar`, pra nunca reusar um redirect
 * cuja assinatura já venceu.
 *
 * `public`, ao contrário do avatar: esta resposta não varia por quem pede —
 * não há sessão, não há organização, o conteúdo é o mesmo pra qualquer
 * navegador que abra o link.
 */
const BROWSER_CACHE_SECONDS = 240;

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!FORMA_DE_UUID.test(id)) return new Response(null, { status: 404 });

  const admin = createAdminClient();
  const { data: anexo } = await admin
    .from("crm_lead_attachments")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  const row = anexo as { storage_path: string; file_name: string } | null;
  if (!row) return new Response(null, { status: 404 });

  const { data: signed, error } = await admin.storage
    .from(BUCKET_DE_ANEXOS)
    .createSignedUrl(row.storage_path, SIGNED_TTL_SECONDS, {
      download: row.file_name,
    });

  if (error || !signed?.signedUrl) {
    // Falha em ASSINAR não é "anexo não existe" — mas do outro lado do link
    // (o navegador do cliente) as duas parecem iguais, e é o cliente que está
    // lendo, não um operador que possa investigar `requestId`. 404 estável.
    return new Response(null, { status: 404 });
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: signed.signedUrl,
      "Cache-Control": `public, max-age=${BROWSER_CACHE_SECONDS}`,
    },
  });
}
