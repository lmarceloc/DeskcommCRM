"use client";

import { useT } from "@/hooks/i18n/useT";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useCompanies, useCreateCompany } from "@/hooks/companies/useCompanies";
import { useProducts } from "@/hooks/catalogo/useProducts";
import type { Lead, Thermometer } from "@/lib/types/leads";
import { updateLeadSchema, type UpdateLeadInput } from "@/lib/schemas/leads";
import { parseReaisToCents } from "@/lib/money";
import { CustomFieldsEditor, type CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import { EcoDoValor } from "./EcoDoValor";

const TERMOMETROS: { valor: NonNullable<Thermometer>; rotulo: string }[] = [
  { valor: "sem_interesse", rotulo: "Sem interesse" },
  { valor: "frio", rotulo: "Frio" },
  { valor: "morno", rotulo: "Morno" },
  { valor: "quente", rotulo: "Quente" },
  { valor: "quase_fechando", rotulo: "Quase fechando" },
];

interface FormShape {
  title: string;
  description: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
  company_id: string;
  thermometer: string;
  product_id: string;
}

interface Props {
  lead: Lead;
  pipelineId: string;
  fieldDefs?: CustomFieldDef[];
  /** Quando o salvamento dá certo. O dossiê NÃO fecha aqui — ver abaixo. */
  onSaved?: () => void;
  /** O dossiê não tem "cancelar"; o diálogo tem. */
  onCancel?: () => void;
}

function centsToReais(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Os campos do lead — extraídos do `EditLeadDialog` para o dossiê usar os
 * MESMOS, em vez de uma cópia que diverge no mês.
 *
 * `onSaved` existe para o dossiê NÃO FECHAR ao salvar: quem edita precisa ver a
 * atividade que acabou de gerar entrar na timeline. Fechar esconderia o
 * registro justamente de quem o produziu — a funcionalidade que prova "sua ação
 * fica registrada" provaria isso para todo mundo menos para o autor.
 */
export function LeadFieldsForm({ lead, pipelineId, fieldDefs = [], onSaved, onCancel }: Props) {
  const t = useT();
  const edit = useEditLead(pipelineId);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(lead.custom_fields ?? {});

  const { data: empresas } = useCompanies();
  const { data: produtos } = useProducts();
  const criarEmpresa = useCreateCompany();
  const [novaEmpresaAberta, setNovaEmpresaAberta] = useState(false);
  const [nomeDaNovaEmpresa, setNomeDaNovaEmpresa] = useState("");

  const form = useForm<FormShape>({
    defaultValues: {
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centsToReais(lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
      company_id: lead.company_id ?? "",
      thermometer: lead.thermometer ?? "",
      product_id: lead.product_id ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centsToReais(lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
      company_id: lead.company_id ?? "",
      thermometer: lead.thermometer ?? "",
      product_id: lead.product_id ?? "",
    });
    setCustomFields(lead.custom_fields ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const reais = values.valueReais.trim();
    let valueCents: number | null = null;
    if (reais.length > 0) {
      valueCents = parseReaisToCents(reais);
      if (valueCents === null) {
        form.setError("valueReais", { message: t("Valor inválido") });
        return;
      }
    }

    const patch: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      value_cents: valueCents,
      tags,
      expected_close_date: values.expected_close_date || null,
      company_id: values.company_id || null,
      thermometer: values.thermometer || null,
      product_id: values.product_id || null,
      ...(fieldDefs.length > 0 ? { custom_fields: customFields } : {}),
    };

    const parsed = updateLeadSchema.safeParse(patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? t("Dados inválidos"));
      return;
    }

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: parsed.data as UpdateLeadInput,
      });
      toast.success(t("Lead atualizado"));
      onSaved?.();
    } catch {
      // toast already shown
    }
  }


  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">{t("Título")}</Label>
          <Input
            id="title"
            {...form.register("title", { required: true, minLength: 2 })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t("Descrição")}</Label>
          <Textarea id="description" rows={3} {...form.register("description")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="valueReais">{t("Valor (R$)")}</Label>
            <Input
              id="valueReais"
              inputMode="decimal"
              placeholder="0,00"
              {...form.register("valueReais")}
            />
            <EcoDoValor control={form.control} />
            {form.formState.errors.valueReais && (
              <p className="text-xs text-error-fg">
                {t(form.formState.errors.valueReais.message ?? "")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="expected_close_date">{t("Fechamento previsto")}</Label>
            <Input
              id="expected_close_date"
              type="date"
              {...form.register("expected_close_date")}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tagsRaw">{t("Tags (separadas por vírgula)")}</Label>
          <Input id="tagsRaw" placeholder="vip, recompra" {...form.register("tagsRaw")} />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="space-y-2">
            <Label>{t("Empresa")}</Label>
            {novaEmpresaAberta ? (
              <div className="flex gap-1.5">
                <Input
                  autoFocus
                  placeholder={t("Nome da empresa")}
                  value={nomeDaNovaEmpresa}
                  onChange={(e) => setNomeDaNovaEmpresa(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setNovaEmpresaAberta(false)}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!nomeDaNovaEmpresa.trim() || criarEmpresa.isPending}
                  onClick={async () => {
                    try {
                      const { data } = await criarEmpresa.mutateAsync({ name: nomeDaNovaEmpresa.trim() });
                      form.setValue("company_id", data.id);
                      setNovaEmpresaAberta(false);
                      setNomeDaNovaEmpresa("");
                    } catch {
                      toast.error(t("Não foi possível criar a empresa."));
                    }
                  }}
                >
                  {t("Criar")}
                </Button>
              </div>
            ) : (
              <Select
                value={form.watch("company_id") || "none"}
                onValueChange={(v) => {
                  if (v === "__nova__") {
                    setNovaEmpresaAberta(true);
                    return;
                  }
                  form.setValue("company_id", v === "none" ? "" : v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Selecione a empresa")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("Nenhuma")}</SelectItem>
                  {(empresas ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__nova__">{t("+ Nova empresa…")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("Termômetro")}</Label>
            <Select
              value={form.watch("thermometer") || "none"}
              onValueChange={(v) => form.setValue("thermometer", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("Sem calibração")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("Sem calibração")}</SelectItem>
                {TERMOMETROS.map((op) => (
                  <SelectItem key={op.valor} value={op.valor}>
                    {t(op.rotulo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("Produto")}</Label>
          <Select
            value={form.watch("product_id") || "none"}
            onValueChange={(v) => form.setValue("product_id", v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("Selecione o produto")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("Nenhum")}</SelectItem>
              {(produtos ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {fieldDefs.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">{t("Campos do funil")}</p>
            <CustomFieldsEditor
              fields={fieldDefs}
              value={customFields}
              onChange={setCustomFields}
              mode="lead"
            />
          </div>
        )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={edit.isPending}>
            {t("Cancelar")}
          </Button>
        )}
        <Button type="submit" disabled={edit.isPending}>
          {edit.isPending ? t("Salvando…") : t("Salvar")}
        </Button>
      </div>
    </form>
  );
}
