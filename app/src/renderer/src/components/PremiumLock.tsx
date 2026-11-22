import type { PremiumFeature } from '@simulador/shared';
import { LockSimple } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useOpenPlan } from '../plan';

/**
 * SPEC-025: o botão de um recurso premium para quem não assina. Continua visível, com o cadeado e
 * "Recurso do plano Assinante"; o clique leva à tela Plano.
 */
export function PremiumLock({
  feature,
  children,
  small = false,
}: {
  feature: PremiumFeature;
  children: ReactNode;
  small?: boolean;
}) {
  const { t } = useTranslation();
  const openPlan = useOpenPlan();
  const hintId = useId();
  return (
    <span className="premium-lock">
      <button
        type="button"
        className={`pill pill-ghost${small ? ' pill-small' : ''} is-locked`}
        aria-describedby={hintId}
        onClick={() => openPlan(feature)}
      >
        {children}
        <span className="pill-icon" aria-hidden="true">
          <LockSimple weight="bold" />
        </span>
      </button>
      <span id={hintId} className="field-hint">
        {t('plan.lockHint')}
      </span>
    </span>
  );
}
