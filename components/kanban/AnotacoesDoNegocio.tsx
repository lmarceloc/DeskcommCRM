"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import type { TimelineItemView } from "@/lib/types/contacts";
import { cn } from "@/lib/utils";

/**
 * Anotação manual no negócio, com @menção VISUAL (decisão do dono do produto:
 * sem notificar quem foi citado, por ora). O texto grava em texto puro —
 * `@Nome Sobrenome` só ganha destaque na LEITURA, comparando com os membros da
 * organização (`useAssignableMembers`, o mesmo elenco de quem pode ser
 * responsável por um negócio). Sem token/formato especial: se a organização
 * renomear alguém, anotações antigas simplesmente param de casar — aceitável
 * para um recurso que é decoração de leitura, não uma referência que precisa
 * sobreviver a rename.
 */

const PADRAO_DE_MENCAO = /@([A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+){0,3})/g;

function textoComMencoes(texto: string, nomesConhecidos: Set<string>): React.ReactNode[] {
  const partes: React.ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(PADRAO_DE_MENCAO)) {
    const nome = m[1]?.trim() ?? "";
    // Guloso do fim pro começo: tenta o trecho inteiro primeiro, depois encurta
    // palavra por palavra, pra "@Maria Silva, tudo bem?" não virar uma menção
    // só "@Maria Silva, tudo bem" por causa da vírgula/pontuação capturada.
    const palavras = nome.split(/\s+/);
    let casado: string | null = null;
    for (let n = palavras.length; n > 0; n--) {
      const candidato = palavras.slice(0, n).join(" ");
      if (nomesConhecidos.has(candidato)) {
        casado = candidato;
        break;
      }
    }
    if (!casado) continue;
    const inicio = m.index ?? 0;
    partes.push(texto.slice(ultimo, inicio));
    partes.push(
      <strong key={`m-${i++}`} className="rounded-sm bg-accent-soft px-1 text-accent">
        @{casado}
      </strong>,
    );
    ultimo = inicio + 1 + casado.length;
  }
  partes.push(texto.slice(ultimo));
  return partes;
}

export function AnotacoesDoNegocio({ leadId, itens }: { leadId: string; itens: TimelineItemView[] }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const qc = useQueryClient();
  const { data: membros } = useAssignableMembers(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const nomesConhecidos = useMemo(
    () => new Set((membros ?? []).map((m) => m.full_name).filter((n): n is string => Boolean(n))),
    [membros],
  );

  const notas = itens.filter((i) => i.type === "note").sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));

  async function adicionar() {
    const limpo = texto.trim();
    if (!limpo) return;
    setEnviando(true);
    try {
      await apiClient.post(`/api/v1/leads/${leadId}/timeline`, { texto: limpo });
      setTexto("");
      await qc.invalidateQueries({ queryKey: ["timeline", leadId] });
    } catch {
      toast.error(t("Não foi possível salvar a anotação."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Textarea
          rows={2}
          placeholder={t("Escreva uma anotação — use @Nome para mencionar alguém do time")}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void adicionar();
            }
          }}
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={!texto.trim() || enviando} onClick={adicionar}>
            {enviando ? t("Salvando…") : t("Adicionar anotação")}
          </Button>
        </div>
      </div>

      {notas.length > 0 && (
        <ul className="space-y-2">
          {notas.map((nota) => (
            <li key={nota.id} className={cn("rounded-md border border-border bg-surface-muted/40 p-2 text-sm")}>
              <p className="whitespace-pre-wrap">{textoComMencoes(nota.reason ?? "", nomesConhecidos)}</p>
              <p className="mt-1 text-[11px] text-text-muted">
                {nota.actor_user_name ?? t("Alguém")} ·{" "}
                {new Date(nota.performed_at).toLocaleString(idioma, {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
