"use client";

import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { linkDoAnexo, useApagarAnexo, useLeadAnexos, useSubirAnexo } from "@/hooks/leads/useLeadAnexos";
import { copyToClipboard } from "@/lib/clipboard";
import { Copy, FileText, Paperclip, Trash } from "@/lib/ui/icons";

interface Props {
  leadId: string;
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Anexos do negócio (proposta, contrato, orçamento). PDF/JPEG/PNG/Word, até
 * 20 MB — teto e tipos definidos em `lib/anexos/tipos.ts`.
 *
 * "Copiar link" é a ação principal, não o download: o pedido do dono do
 * produto é mandar o LINK pro cliente, nunca o arquivo pelo WhatsApp — o link
 * é permanente (`GET /api/v1/anexos/{id}`, nunca expira).
 */
export function AnexosDoNegocio({ leadId }: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: anexos, isLoading } = useLeadAnexos(leadId);
  const subir = useSubirAnexo(leadId);
  const apagar = useApagarAnexo(leadId);

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    subir.mutate(file);
    e.target.value = "";
  }

  async function copiarLink(anexoId: string) {
    const ok = await copyToClipboard(linkDoAnexo(anexoId));
    if (ok) {
      toast.success(t("Link copiado."));
    } else {
      toast.error(t("Não foi possível copiar o link."));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {isLoading ? (
        <p className="text-xs text-text-muted">{t("Carregando…")}</p>
      ) : !anexos || anexos.length === 0 ? (
        <p className="text-xs text-text-muted">{t("Nenhum anexo ainda.")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              <FileText className="size-4 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate" title={a.file_name}>
                {a.file_name}
              </span>
              <span className="shrink-0 text-text-muted">{formatarTamanho(a.size_bytes)}</span>
              <button
                type="button"
                onClick={() => copiarLink(a.id)}
                className="shrink-0 text-text-muted hover:text-text"
                title={t("Copiar link")}
              >
                <Copy className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => apagar.mutate(a.id)}
                disabled={apagar.isPending}
                className="shrink-0 text-text-muted hover:text-destructive"
                title={t("Apagar anexo")}
              >
                <Trash className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        className="hidden"
        onChange={aoEscolherArquivo}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={subir.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-4" />
        {subir.isPending ? t("Subindo…") : t("Anexar arquivo")}
      </Button>
    </div>
  );
}
