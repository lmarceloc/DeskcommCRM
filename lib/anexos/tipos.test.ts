import { describe, expect, it } from "vitest";

import { anexoPertenceAoNegocio, extensaoDoAnexo, farejarTipoDoAnexo } from "./tipos";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OUTRA_ORG = "aaaaaaaa-0000-4000-8000-000000000002";
const LEAD = "bbbbbbbb-0000-4000-8000-000000000001";
const ARQUIVO = "cccccccc-dddd-4eee-8fff-000000000001.pdf";

const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const DOC = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const DOCX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const SVG = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
const TEXTO_PURO = new TextEncoder().encode("oi, isto não é nenhum dos formatos");

describe("farejarTipoDoAnexo — decide pelos bytes, nunca pelo Content-Type declarado", () => {
  it("reconhece PDF pela assinatura %PDF-", () => {
    expect(farejarTipoDoAnexo(PDF)).toBe("application/pdf");
  });

  it("reconhece PNG e JPEG (mesmas assinaturas do logo)", () => {
    expect(farejarTipoDoAnexo(PNG)).toBe("image/png");
    expect(farejarTipoDoAnexo(JPEG)).toBe("image/jpeg");
  });

  it("reconhece .doc (OLE Compound File)", () => {
    expect(farejarTipoDoAnexo(DOC)).toBe("application/msword");
  });

  it("reconhece .docx (ZIP / Office Open XML)", () => {
    expect(farejarTipoDoAnexo(DOCX)).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("recusa SVG — é XML com script executável, e o repo não tem CSP", () => {
    expect(farejarTipoDoAnexo(SVG)).toBeNull();
  });

  it("recusa o que não bate com nenhuma assinatura conhecida", () => {
    expect(farejarTipoDoAnexo(TEXTO_PURO)).toBeNull();
  });

  it("recusa buffer vazio ou menor que qualquer assinatura", () => {
    expect(farejarTipoDoAnexo(new Uint8Array(0))).toBeNull();
    expect(farejarTipoDoAnexo(Uint8Array.from([0x25, 0x50]))).toBeNull();
  });
});

describe("extensaoDoAnexo", () => {
  it("cada tipo aceito tem extensão própria", () => {
    expect(extensaoDoAnexo("application/pdf")).toBe("pdf");
    expect(extensaoDoAnexo("image/jpeg")).toBe("jpg");
    expect(extensaoDoAnexo("image/png")).toBe("png");
    expect(extensaoDoAnexo("application/msword")).toBe("doc");
    expect(
      extensaoDoAnexo("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("docx");
  });
});

describe("anexoPertenceAoNegocio — o leitor confere o caminho que a linha traz", () => {
  it("aceita o caminho na forma exata que a rota gera", () => {
    expect(anexoPertenceAoNegocio(`${ORG}/${LEAD}/${ARQUIVO}`, ORG, LEAD)).toBe(true);
  });

  it("recusa o caminho de OUTRA organização gravado na linha pelo PostgREST", () => {
    expect(anexoPertenceAoNegocio(`${OUTRA_ORG}/${LEAD}/${ARQUIVO}`, ORG, LEAD)).toBe(false);
  });

  it("recusa o caminho de outro negócio da mesma organização", () => {
    const outroLead = "bbbbbbbb-0000-4000-8000-000000000002";
    expect(anexoPertenceAoNegocio(`${ORG}/${outroLead}/${ARQUIVO}`, ORG, LEAD)).toBe(false);
  });

  it("recusa quem tenta sair da pasta com `..` depois do prefixo certo", () => {
    expect(
      anexoPertenceAoNegocio(`${ORG}/${LEAD}/../../${OUTRA_ORG}/${LEAD}/${ARQUIVO}`, ORG, LEAD),
    ).toBe(false);
  });

  it("recusa extensão que a rota nunca grava", () => {
    expect(anexoPertenceAoNegocio(`${ORG}/${LEAD}/${ARQUIVO.replace(".pdf", ".svg")}`, ORG, LEAD)).toBe(
      false,
    );
  });

  it("aceita cada extensão que a rota de fato grava", () => {
    for (const ext of ["pdf", "jpg", "png", "doc", "docx"]) {
      expect(anexoPertenceAoNegocio(`${ORG}/${LEAD}/${ARQUIVO.replace(".pdf", `.${ext}`)}`, ORG, LEAD)).toBe(
        true,
      );
    }
  });
});
