import type { Metadata } from "next";

import { requireAuth } from "@/lib/auth/server";

import { CompaniesClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Empresas" };

export default async function CompaniesPage() {
  await requireAuth();
  return <CompaniesClient />;
}
