import type { Metadata } from "next";

import { requireAuth } from "@/lib/auth/server";

import { HotLeadsClient } from "./_components/HotLeadsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads quentes" };

export default async function HotLeadsPage() {
  // `viewer` também abre a página; a rota devolve 403 pra ele (agent+), e o
  // hook mostra o erro — mesmo padrão de outras telas que a API corta por papel.
  await requireAuth();
  return <HotLeadsClient />;
}
