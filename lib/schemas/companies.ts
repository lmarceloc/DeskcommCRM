import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().url().max(300).nullable().optional(),
  linkedin_url: z.string().trim().url().max(300).nullable().optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const listCompaniesSchema = z.object({
  q: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
