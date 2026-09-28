import "server-only";

import { BUCKET_DE_ANEXOS } from "@/lib/anexos/tipos";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Apaga o arquivo do bucket. Falha aqui não desfaz nada: a LINHA já saiu (ou
 * nunca gravou) — o que sobra, na pior hipótese, é um arquivo órfão que
 * ninguém referencia, nunca o contrário (linha sem arquivo).
 */
export async function apagarAnexoDoBucket(caminho: string, requestId: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(BUCKET_DE_ANEXOS).remove([caminho]);
  if (error) {
    logger.warn("[anexos] remoção do arquivo falhou", { detalhe: error.message, requestId });
  }
}
