import i18n from 'i18next';
import { useEffect } from 'react';
import { currentLanguage } from './i18n';
import {
  brasiliaClock,
  CHECK_INTERVAL_MS,
  inCheckWindow,
  pendingMoves,
  readSentToday,
  readVariationSettings,
  saveSentToday,
  variationNotices,
} from './variation';

/**
 * SPEC-033: com a conta de usuário e conexão, confere a variação do dia a cada 5 minutos, nos dias
 * úteis das 10:30 às 18:30, e pede ao sistema o aviso do que passou do limiar escolhido em Meu
 * perfil (com a janela aberta ou minimizada). `userId` nulo (colaborador ou fora da conta) ou sem
 * conexão (SPEC-032): não confere. A escolha é lida a cada conferência: o que mudar em Meu perfil
 * vale a partir da próxima.
 */
export function useVariationNotices(userId: string | null, offline: boolean): void {
  useEffect(() => {
    if (userId === null || offline) return;
    let stopped = false;
    let checking = false;

    const check = async () => {
      const now = new Date();
      if (checking || !inCheckWindow(now) || !readVariationSettings(userId).enabled) return;
      checking = true;
      try {
        const result = await window.api.portfolios.dayChanges();
        // Da cópia local (a conexão caiu no meio), a cotação não é nova: nada a avisar.
        if (stopped || !result.ok || result.savedAt !== undefined) return;
        const settings = readVariationSettings(userId);
        if (!settings.enabled) return;
        const today = brasiliaClock(now).date;
        const sent = readSentToday(userId, today);
        const moves = pendingMoves(result.data.assets, settings.threshold, sent);
        if (moves.length === 0) return;
        const notices = variationNotices(
          moves,
          settings.threshold,
          (key, values) => i18n.t(key, values),
          currentLanguage(),
        );
        // Guardado antes de mostrar: um aviso nunca se repete, nem se o app fechar no meio.
        for (const move of moves) sent.add(move.key);
        saveSentToday(userId, today, sent);
        for (const notice of notices) {
          if (stopped) break;
          await window.api.notifications.show(notice);
        }
      } catch {
        // Falhou desta vez: a próxima conferência tenta de novo.
      } finally {
        checking = false;
      }
    };

    void check();
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [userId, offline]);
}
