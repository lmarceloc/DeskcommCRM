"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useDesvincularContato, useLeadContacts, useVincularContato } from "@/hooks/leads/useLeadContacts";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { Plus, X } from "@/lib/ui/icons";
import { SeletorDeContato } from "./SeletorDeContato";

/**
 * "Outros contatos" do negócio B2B (migration 0430) — quem participa da
 * negociação além do contato PRINCIPAL (`crm_leads.contact_id`, mostrado à
 * parte em `ContatoDoNegocio`). O financeiro, o técnico, quem assina.
 */
export function OutrosContatosDoNegocio({ leadId }: { leadId: string }) {
  const t = useT();
  const { data: vinculos, isLoading } = useLeadContacts(leadId);
  const vincular = useVincularContato(leadId);
  const desvincular = useDesvincularContato(leadId);
  const [adicionando, setAdicionando] = useState(false);

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-xs text-text-muted">{t("Carregando…")}</p>
      ) : (vinculos ?? []).length === 0 && !adicionando ? (
        <p className="text-xs text-text-muted">{t("Nenhum outro contato vinculado.")}</p>
      ) : (
        <ul className="space-y-1.5">
          {(vinculos ?? []).map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="truncate">{rotuloDoContato(v.contacts, t)}</span>
                {v.contacts?.job_title && (
                  <span className="ml-1.5 text-xs text-text-muted">· {v.contacts.job_title}</span>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("Remover vínculo")}
                onClick={async () => {
                  try {
                    await desvincular.mutateAsync(v.id);
                  } catch {
                    toast.error(t("Não foi possível remover o vínculo."));
                  }
                }}
              >
                <X size={14} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adicionando ? (
        <SeletorDeContato
          escolhido={null}
          onEscolher={async (contato) => {
            if (!contato) {
              setAdicionando(false);
              return;
            }
            try {
              await vincular.mutateAsync(contato.id);
              setAdicionando(false);
            } catch {
              toast.error(t("Não foi possível vincular o contato."));
            }
          }}
        />
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdicionando(true)}>
          <Plus size={14} aria-hidden className="mr-1.5" /> {t("Adicionar contato")}
        </Button>
      )}
    </div>
  );
}
