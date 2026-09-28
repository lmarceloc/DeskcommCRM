"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export interface Company {
  id: string;
  name: string;
  website: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useCompanies(busca = "") {
  return useQuery({
    queryKey: ["companies", busca],
    queryFn: async () =>
      apiClient.get<{ data: Company[] }>(`/api/v1/companies${busca ? `?q=${encodeURIComponent(busca)}` : ""}`),
    staleTime: 30_000,
    select: (res) => res.data,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { name: string; website?: string | null; linkedin_url?: string | null }) =>
      apiClient.post<{ data: Company }>("/api/v1/companies", args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}
