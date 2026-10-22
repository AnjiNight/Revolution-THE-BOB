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
