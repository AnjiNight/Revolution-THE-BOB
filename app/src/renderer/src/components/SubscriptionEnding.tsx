import { SUBSCRIPTION_ENDING_WARNING_DAYS } from '@simulador/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../format';
import { endingSoon, useOpenPlan } from '../plan';
import '../plan.css';

/**
 * SPEC-025: no Início, nos 3 dias antes do fim de uma assinatura cancelada, "Sua assinatura termina
 * em 22/12/2026", com o caminho para a tela Plano (onde dá para reativar).
 */
export function SubscriptionEnding() {
  const { t, i18n } = useTranslation();
  const openPlan = useOpenPlan();
  const [endsAt, setEndsAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.api.subscription.mine().then((result) => {
      if (active && result.ok) {
        setEndsAt(endingSoon(result.data, new Date(), SUBSCRIPTION_ENDING_WARNING_DAYS));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!endsAt) return null;
  return (
    <p className="subscription-ending" role="status">
      {t('plan.ending', { date: formatDate(endsAt, i18n.language) })}{' '}
      <button type="button" className="pill pill-ghost pill-small" onClick={() => openPlan()}>
        {t('plan.endingAction')}
      </button>
    </p>
  );
}
