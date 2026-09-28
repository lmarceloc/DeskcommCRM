/**
 * O que ENTRA no bucket de anexos do negócio — decidido pelos BYTES, nunca
 * pelo que quem sobe declarou. Mesma doutrina de `lib/branding/logo-arquivo.ts`
 * (issue que motivou aquele módulo): `file.type` é o Content-Type da parte
 * multipart, que quem sobe escolhe: `.exe` renomeado para `.pdf` chega com
 * `file.type = "application/pdf"`.
 *
 * SVG não entra na lista — nem por engano: é XML com `<script>` executável, e
 * este repo não define `Content-Security-Policy` (`next.config.ts` sem
 * `headers()`, sem `middleware.ts`). Aqui o vetor é ainda mais direto que no
 * logo: o link do anexo é PÚBLICO e vai para o WhatsApp do cliente.
 */

export const BUCKET_DE_ANEXOS = "deal-attachments";

/** 20 MB — o mesmo teto de `app/api/v1/ai/knowledge/sources/upload`. */
export const TAMANHO_MAXIMO_DO_ANEXO = 20 * 1024 * 1024;

/**
 * Espelho do CHECK `crm_lead_attachments_tipo_check` (migration 0429).
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts` lê esta tupla e
 * compara com o banco — mudar um lado sem o outro quebra o gate, não em
 * produção.
 */
export const TIPOS_DE_ANEXO_ACEITOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export type TipoDeAnexo = (typeof TIPOS_DE_ANEXO_ACEITOS)[number];

const EXTENSAO_POR_TIPO: Record<TipoDeAnexo, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function extensaoDoAnexo(tipo: TipoDeAnexo): string {
  return EXTENSAO_POR_TIPO[tipo];
}

function comecaCom(bytes: Uint8Array, assinatura: readonly number[]): boolean {
  if (bytes.length < assinatura.length) return false;
  return assinatura.every((b, i) => bytes[i] === b);
}

/** `25 50 44 46 2D` — "%PDF-", o cabeçalho de todo PDF (ISO 32000-1 §7.5.2). */
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
/** `89 50 4E 47 0D 0A 1A 0A` — PNG (RFC 2083 §3.1). */
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
/** `FF D8 FF` — SOI + primeiro marcador de JPEG (mesma assinatura do logo). */
const JPEG = [0xff, 0xd8, 0xff] as const;
/** `D0 CF 11 E0 A1 B1 1A E1` — OLE Compound File: .doc antigo (Word 97-2003). */
const OLE_DOC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
/** `50 4B 03 04` — cabeçalho local ZIP: .docx é um ZIP (Office Open XML). */
const ZIP = [0x50, 0x4b, 0x03, 0x04] as const;

/**
 * O tipo REAL do arquivo, pela assinatura. `null` = não reconheci, ou
 * reconheci algo que não está na lista — os dois casos levam ao mesmo lugar
 * de propósito (distingui-los daria a quem ataca um oráculo de formato).
 *
 * ⚠️ Dois LIMITES conhecidos, documentados em vez de escondidos:
 *
 * 1. `OLE_DOC` também é a assinatura de `.xls`/`.ppt` antigos — o formato OLE
 *    Compound File é o mesmo contêiner para os três. Um `.xls` renomeado para
 *    `.doc` passa aqui. Word abre o arquivo mesmo assim (ou recusa educado);
 *    não é o vetor de execução de script que a proibição de SVG fecha.
 * 2. `ZIP` é o contêiner de QUALQUER Office Open XML (`.xlsx`, `.pptx`) e de
 *    formatos não-Office (`.epub`, `.jar`, zip puro). Aceitar mais do que
 *    ZIP-que-declarou-ser-docx exigiria abrir o arquivo e ler o
 *    `[Content_Types].xml` de dentro — custo real para um risco que não é de
 *    execução (nenhum navegador roda um `.docx`/zip ao abrir).
 *
 * Os dois pontos valem para uploads de `agent`+ autenticado desta organização
 * — não para um formulário público. O risco que este farejador FECHA de
 * verdade é o mesmo do logo: nada que um navegador EXECUTE sai daqui.
 */
export function farejarTipoDoAnexo(bytes: Uint8Array): TipoDeAnexo | null {
  if (comecaCom(bytes, PDF)) return "application/pdf";
  if (comecaCom(bytes, PNG)) return "image/png";
  if (comecaCom(bytes, JPEG)) return "image/jpeg";
  if (comecaCom(bytes, OLE_DOC)) return "application/msword";
  if (comecaCom(bytes, ZIP))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

/** O caminho É desta organização e deste negócio, na forma exata que a rota gera? */
export function anexoPertenceAoNegocio(caminho: string, orgId: string, leadId: string): boolean {
  const prefixo = `${orgId}/${leadId}/`;
  if (!caminho.startsWith(prefixo)) return false;
  const resto = caminho.slice(prefixo.length);
  const forma = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|doc|docx)$/;
  return forma.test(resto);
}
