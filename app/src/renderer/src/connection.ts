import { createContext, useContext, useMemo, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * SPEC-032: o modo consulta (sem conexão com o servidor). As telas leem daqui se podem escrever;
 * quem decide é o processo principal, que avisa o App.
 */
export const ConnectionContext = createContext<{ offline: boolean }>({ offline: false });

/** A dica "Precisa de conexão." fica na faixa do modo consulta; os botões apontam para ela. */
export const OFFLINE_HINT_ID = 'dica-sem-conexao';

export function useOffline(): boolean {
  return useContext(ConnectionContext).offline;
}

/** Props de um botão de escrita no modo consulta: desativado, com a dica, mas ainda focável. */
export type NeedsConnectionProps = {
  'aria-disabled'?: true;
  'aria-describedby'?: string;
  title?: string;
};

/**
 * SPEC-032 §4.2: os botões de escrita continuam na tela, marcados como desativados e com a dica
 * "Precisa de conexão" (esconder mudaria a tela de quem já a conhece). Quem barra o clique é a
 * moldura (`stopDisabledClick`), para nenhuma ação escapar.
 */
export function useNeedsConnection(): { offline: boolean; props: NeedsConnectionProps } {
  const offline = useOffline();
  const { t } = useTranslation();
  return useMemo(
    () => ({
      offline,
      props: offline
        ? {
            'aria-disabled': true as const,
            'aria-describedby': OFFLINE_HINT_ID,
            title: t('offline.needsConnection'),
          }
        : {},
    }),
    [offline, t],
  );
}

/**
 * No modo consulta, um clique (do mouse, do Enter ou do espaço) num botão marcado como desativado
 * não chega à ação dele, nem envia o formulário em que ele está.
 */
export function stopDisabledClick(event: SyntheticEvent): void {
  const target = event.target as Element | null;
  if (target?.closest?.('[aria-disabled="true"]')) {
    event.preventDefault();
    event.stopPropagation();
  }
}
