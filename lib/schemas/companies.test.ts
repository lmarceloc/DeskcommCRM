import { describe, expect, it } from "vitest";

import { createCompanySchema, listCompaniesSchema, updateCompanySchema } from "./companies";

describe("createCompanySchema", () => {
  it("aceita só o nome", () => {
    expect(createCompanySchema.safeParse({ name: "Acme" }).success).toBe(true);
  });

  it("recusa nome vazio", () => {
    expect(createCompanySchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("recusa site que não é URL", () => {
    expect(createCompanySchema.safeParse({ name: "Acme", website: "não é url" }).success).toBe(false);
  });

  it("aceita site e linkedin nulos (desvincular)", () => {
    expect(
      createCompanySchema.safeParse({ name: "Acme", website: null, linkedin_url: null }).success,
    ).toBe(true);
  });
});

describe("updateCompanySchema", () => {
  it("todos os campos são opcionais", () => {
    expect(updateCompanySchema.safeParse({}).success).toBe(true);
  });
});

describe("listCompaniesSchema", () => {
  it("aplica limite padrão", () => {
    const parsed = listCompaniesSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.limit).toBe(20);
  });
});
