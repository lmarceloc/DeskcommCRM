"use client";

/**
 * Armazenamento TEMPORÁRIO das cadências, no navegador.
 *
 * O construtor nasceu antes do backend: para dar para criar, editar e voltar
 * a uma cadência, ela fica no localStorage deste navegador. Quando a API
 * `/api/v1/cadencias` existir, este hook troca a origem e as telas não mudam —
 * elas só conhecem `useCadencias()` e `useCadencia(id)`.
 */
import { useCallback, useSyncExternalStore } from "react";

import { novoId } from "@/lib/cadencias/arvore";
import { cadenciaDeExemplo, configuracaoPadrao } from "@/lib/cadencias/exemplos";
import type { Cadencia } from "@/lib/cadencias/tipos";

const CHAVE = "crm.cadencias.v1";
const VAZIO: Cadencia[] = [];

let cache: Cadencia[] | null = null;
const ouvintes = new Set<() => void>();

function ler(): Cadencia[] {
  if (cache) return cache;
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    cache = bruto ? (JSON.parse(bruto) as Cadencia[]) : [cadenciaDeExemplo()];
  } catch {
    cache = [cadenciaDeExemplo()];
  }
  return cache;
}

function gravar(lista: Cadencia[]) {
  cache = lista;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Navegador sem armazenamento: a cadência vive só nesta aba.
  }
  for (const o of ouvintes) o();
}

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export function useCadencias() {
  const lista = useSyncExternalStore(assinar, ler, () => VAZIO);

  const criar = useCallback((nome: string, tagDoSegmento: string): Cadencia => {
    const agora = new Date().toISOString();
    const nova: Cadencia = {
      id: novoId(),
      nome,
      status: "rascunho",
      criadaEm: agora,
      atualizadaEm: agora,
      configuracao: { ...configuracaoPadrao(), tagDoSegmento },
      passos: [],
    };
    gravar([nova, ...ler()]);
    return nova;
  }, []);

  const excluir = useCallback((id: string) => {
    gravar(ler().filter((c) => c.id !== id));
  }, []);

  return { lista, criar, excluir };
}

export function useCadencia(id: string) {
  const lista = useSyncExternalStore(assinar, ler, () => VAZIO);
  const cadencia = lista.find((c) => c.id === id) ?? null;

  const salvar = useCallback(
    (nova: Cadencia) => {
      gravar(
        ler().map((c) =>
          c.id === id ? { ...nova, atualizadaEm: new Date().toISOString() } : c,
        ),
      );
    },
    [id],
  );

  return { cadencia, salvar, carregando: lista === VAZIO };
}
