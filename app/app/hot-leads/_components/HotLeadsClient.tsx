"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHotLeads } from "@/hooks/cadencias/useHotLeads";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { EnvelopeSimple, Fire } from "@/lib/ui/icons";

const ROTULO_STATUS: Record<string, string> = {
  open: "Aberto",
  won: "Ganho",
  lost: "Perdido",
};

export function HotLeadsClient() {
  const t = useT();
  const idioma = useTagDeIdioma();
  const { data, isLoading, isError, error } = useHotLeads();

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Fire size={24} aria-hidden className="text-warning" />
          {t("Leads quentes")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Quem abriu o mesmo e-mail de uma cadência 3 vezes ou mais — sinal de interesse pra trabalhar agora.")}
        </p>
      </header>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <Card className="p-6 text-sm text-destructive">
          {t("Não consegui carregar os leads quentes.")}
          {error instanceof Error ? ` ${error.message}` : null}
        </Card>
      ) : !data || data.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Fire size={24} aria-hidden />
          </span>
          <p className="font-medium">{t("Nenhum lead quente ainda")}</p>
          <p className="max-w-md text-sm text-text-muted">
            {t("Assim que um lead inscrito numa cadência ativa abrir o mesmo e-mail 3 vezes, ele aparece aqui.")}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {data.data.map((lead) => (
            <div
              key={lead.enrollment_id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                {lead.lead_id && lead.pipeline_id ? (
                  <Link
                    href={`/app/pipelines/${lead.pipeline_id}?lead=${lead.lead_id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {lead.lead_title ?? t("Negócio sem título")}
                  </Link>
                ) : (
                  <p className="truncate font-medium">{lead.lead_title ?? t("Negócio sem título")}</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {lead.contact_name && <span>{lead.contact_name}</span>}
                  <span className="flex items-center gap-1">
                    <EnvelopeSimple size={14} aria-hidden /> {lead.cadence_name ?? t("Cadência")}
                  </span>
                  {lead.lead_status && (
                    <Badge variant={lead.lead_status === "open" ? "neutral" : lead.lead_status === "won" ? "success" : "destructive"}>
                      {t(ROTULO_STATUS[lead.lead_status] ?? lead.lead_status)}
                    </Badge>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {lead.ultima_abertura_em && (
                  <span className="text-sm text-muted-foreground">
                    {t("Última abertura")}{" "}
                    {new Date(lead.ultima_abertura_em).toLocaleString(idioma, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <Badge variant="warning" className="flex items-center gap-1">
                  <Fire size={12} aria-hidden /> {lead.aberturas}× {t("aberturas")}
                </Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
