"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export interface ProdutoDoCatalogo {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
}

/** Só pro seletor "Produto" do negócio — reusa `/api/v1/products` (viewer+). */
export function useProducts() {
  return useQuery({
    queryKey: ["products", "picker"],
    queryFn: async () => apiClient.get<{ data: ProdutoDoCatalogo[] }>("/api/v1/products"),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}
