"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { ApiError, type ApiErrorBody } from "@/lib/api/types";

export interface Anexo {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

const chave = (leadId: string) => ["lead-anexos", leadId] as const;

/** O link que o vendedor copia e manda pro cliente — nunca expira (ver a rota pública). */
export function linkDoAnexo(anexoId: string): string {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/anexos/${anexoId}`;
}

export function useLeadAnexos(leadId: string | null) {
  return useQuery({
    queryKey: leadId ? chave(leadId) : ["lead-anexos", "vazio"],
    queryFn: () => apiClient.get<Anexo[]>(`/api/v1/leads/${leadId}/anexos`),
    enabled: leadId !== null,
  });
}

export function useSubirAnexo(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch(`/api/v1/leads/${leadId}/anexos`, { method: "POST", body: form });
      const json = (await res.json()) as Partial<ApiErrorBody> & { data?: Anexo };
      if (!res.ok || !json.data) {
        const e = json.error;
        throw new ApiError(res.status, e?.code ?? "upload_failed", e?.details, e?.request_id ?? "", e?.message);
      }
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(leadId) }),
    onError: (err) => showApiError(err),
  });
}

export function useApagarAnexo(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (anexoId: string) => apiClient.delete(`/api/v1/leads/${leadId}/anexos/${anexoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(leadId) }),
    onError: (err) => showApiError(err),
  });
}
