"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export interface LeadContactLink {
  id: string;
  contact_id: string;
  created_at: string;
  contacts: {
    id: string;
    name: string | null;
    display_name: string | null;
    email: string | null;
    phone_number: string | null;
    job_title: string | null;
  } | null;
}

/** Os OUTROS contatos do negócio (além do principal) — migration 0430. */
export function useLeadContacts(leadId: string) {
  return useQuery({
    queryKey: ["lead-contacts", leadId],
    queryFn: async () => apiClient.get<{ data: LeadContactLink[] }>(`/api/v1/leads/${leadId}/contacts`),
    select: (res) => res.data,
  });
}

export function useVincularContato(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) =>
      apiClient.post(`/api/v1/leads/${leadId}/contacts`, { contact_id: contactId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-contacts", leadId] }),
  });
}

export function useDesvincularContato(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => apiClient.delete(`/api/v1/leads/${leadId}/contacts/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-contacts", leadId] }),
  });
}
