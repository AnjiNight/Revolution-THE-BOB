import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientAuthError, ClientResult } from '../../shared/auth-ipc';

interface QueryState<T> {
  data: T | null;
  error?: ClientAuthError | undefined;
  /** Consulta a que `data`/`error` respondem (para saber se ainda está carregando). */
  answered: string | null;
}

/**
 * Busca de ativos que acompanha os filtros (SPEC-006): espera a pessoa parar de digitar, ignora
 * respostas antigas que chegam fora de ordem e mantém o resultado anterior na tela enquanto
 * carrega. `fetcher` precisa ser estável (ex.: `window.api.assets.search`).
 */
export function useAssetQuery<Q, T>(
  query: Q,
  fetcher: (query: Q) => Promise<ClientResult<T>>,
  onSessionExpired: () => void,
  debounceMs = 250,
) {
  const key = JSON.stringify(query);
  const [state, setState] = useState<QueryState<T>>({ data: null, answered: null });
  const [version, setVersion] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    latest.current += 1;
    const request = latest.current;
    const timer = setTimeout(() => {
      void fetcher(JSON.parse(key) as Q).then((result) => {
        if (request !== latest.current) return;
        if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
        setState((previous) =>
          result.ok
            ? { data: result.data, answered: key }
            : { data: previous.data, error: result.error, answered: key },
        );
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [key, version, fetcher, onSessionExpired, debounceMs]);

  /** Consulta de novo com os mesmos filtros (depois de uma alteração). */
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return {
    data: state.data,
    error: state.error,
    loading: state.answered !== key,
    reload,
  };
}

interface Page {
  assets: readonly unknown[];
  hasMore: boolean;
  total: number;
}

/**
 * Lista com "Mostrar mais" (mudança da SPEC-006 em 03/11/2026): a primeira página acompanha os
 * filtros (`useAssetQuery`); cada "Mostrar mais" pede a página seguinte e junta embaixo. As páginas
 * extras valem só para a primeira página de que partiram: trocar os filtros, ou recarregar depois
 * de uma alteração, volta para a primeira.
 */
export function useAssetPages<Q extends { offset?: number }, T extends Page>(
  query: Q,
  fetcher: (query: Q) => Promise<ClientResult<T>>,
  onSessionExpired: () => void,
) {
  type Item = T['assets'][number];
  const first = useAssetQuery(query, fetcher, onSessionExpired);
  const [more, setMore] = useState<{ base: T; assets: Item[]; hasMore: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<{ base: T; error: ClientAuthError } | null>(null);

  const base = first.data;
  const extra = more && more.base === base ? more : null;
  const assets: Item[] = base
    ? [...(base.assets as readonly Item[]), ...(extra?.assets ?? [])]
    : [];

  const loadMore = async () => {
    if (!base || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    const result = await fetcher({ ...query, offset: assets.length });
    setLoadingMore(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      setMoreError({ base, error: result.error });
      return;
    }
    setMore((previous) => ({
      base,
      assets: [
        ...(previous?.base === base ? previous.assets : []),
        ...(result.data.assets as readonly Item[]),
      ],
      hasMore: result.data.hasMore,
    }));
  };

  return {
    ...first,
    assets,
    hasMore: extra ? extra.hasMore : (base?.hasMore ?? false),
    total: base?.total ?? 0,
    /** Já veio alguma página além da primeira. */
    loadedMore: extra !== null,
    loadMore,
    loadingMore,
    moreError: moreError?.base === base ? moreError.error : undefined,
  };
}
