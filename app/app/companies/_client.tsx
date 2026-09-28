"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies, useCreateCompany } from "@/hooks/companies/useCompanies";
import { useT } from "@/hooks/i18n/useT";
import { Buildings, Plus } from "@/lib/ui/icons";

export function CompaniesClient() {
  const t = useT();
  const [busca, setBusca] = useState("");
  const { data: empresas, isLoading, isError } = useCompanies(busca);
  const [novaAberta, setNovaAberta] = useState(false);

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Empresas")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("As empresas dos seus negócios — vincule um negócio a uma empresa no dossiê dele.")}
          </p>
        </div>
        <Button onClick={() => setNovaAberta(true)}>
          <Plus size={14} aria-hidden className="mr-2" /> {t("Nova empresa")}
        </Button>
      </header>

      <Input
        placeholder={t("Buscar por nome…")}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <Card className="p-6 text-sm text-destructive">{t("Não consegui carregar as empresas.")}</Card>
      ) : (empresas ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Buildings size={24} aria-hidden />
          </span>
          <p className="font-medium">{t("Nenhuma empresa ainda")}</p>
          <Button className="mt-2" onClick={() => setNovaAberta(true)}>
            <Plus size={14} aria-hidden className="mr-2" /> {t("Nova empresa")}
          </Button>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {(empresas ?? []).map((e) => (
            <div key={e.id} className="flex flex-col gap-1 p-4">
              <span className="font-medium">{e.name}</span>
              <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                {e.website && (
                  <Link href={e.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {e.website}
                  </Link>
                )}
                {e.linkedin_url && (
                  <Link href={e.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    LinkedIn
                  </Link>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}

      <NovaEmpresaDialog aberto={novaAberta} onFechar={() => setNovaAberta(false)} />
    </div>
  );
}

function NovaEmpresaDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const t = useT();
  const criar = useCreateCompany();
  const [nome, setNome] = useState("");
  const [site, setSite] = useState("");
  const [linkedin, setLinkedin] = useState("");

  async function submeter() {
    if (!nome.trim()) return;
    try {
      await criar.mutateAsync({
        name: nome.trim(),
        website: site.trim() || null,
        linkedin_url: linkedin.trim() || null,
      });
      setNome("");
      setSite("");
      setLinkedin("");
      onFechar();
    } catch {
      toast.error(t("Não foi possível criar a empresa."));
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submeter();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{t("Nova empresa")}</DialogTitle>
            <DialogDescription>{t("Nome, site e LinkedIn — o resto você preenche depois.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="empresa-nome">{t("Nome")}</Label>
            <Input id="empresa-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="empresa-site">{t("Site")}</Label>
            <Input id="empresa-site" type="url" placeholder="https://…" value={site} onChange={(e) => setSite(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="empresa-linkedin">LinkedIn</Label>
            <Input
              id="empresa-linkedin"
              type="url"
              placeholder="https://linkedin.com/company/…"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={!nome.trim() || criar.isPending}>
              {t("Criar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
