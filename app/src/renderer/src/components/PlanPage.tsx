import {
  isPaidPlanCode,
  type MySubscription,
  type PaidPlanCode,
  type Plan,
  type PremiumFeature,
} from '@simulador/shared';
import { Check, LockSimpleOpen } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { useNeedsConnection } from '../connection';
import { formatDate } from '../format';
import { formatPlanPrice } from '../plan';
import '../plan.css';

type Confirming = { kind: 'subscribe'; plan: Plan & { code: PaidPlanCode } } | { kind: 'cancel' };

/**
 * SPEC-025: a tela Plano. O plano atual, os planos com o que incluem, assinar (pagamento
 * simulado, sem nenhum campo de pagamento), cancelar ou reativar a renovação e os pagamentos
 * simulados. O colaborador não tem plano (decisão 6).
 */
export function PlanPage({
  feature,
  onSubscriptionChanged,
  onSessionExpired,
}: {
  /** O recurso premium que trouxe a pessoa até aqui (o cadeado). */
  feature?: PremiumFeature | undefined;
  onSubscriptionChanged?: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const needs = useNeedsConnection();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [mine, setMine] = useState<MySubscription | null>(null);
  const [loadError, setLoadError] = useState<ClientAuthError | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientAuthError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([window.api.subscription.plans(), window.api.subscription.mine()]).then(
      ([planList, subscription]) => {
        if (!active) return;
        for (const result of [planList, subscription]) {
          if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
        }
        if (planList.ok) setPlans(planList.data.plans);
        if (subscription.ok) setMine(subscription.data);
        const failed = !planList.ok ? planList : !subscription.ok ? subscription : null;
        setLoadError(failed && !failed.ok ? failed.error : null);
      },
    );
    return () => {
      active = false;
    };
  }, [onSessionExpired]);

  useEffect(() => {
    if (done) status.current?.focus();
  }, [done]);

  const date = (iso: string) => formatDate(iso, i18n.language);
  const planName = (code: Plan['code']) => t(`plan.names.${code}`);

  const act = async (
    action: () => Promise<
      { ok: true; data: MySubscription } | { ok: false; error: ClientAuthError }
    >,
    message: (data: MySubscription) => string,
  ) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setError(result.error);
    }
    setMine(result.data);
    setConfirming(null);
    setDone(message(result.data));
    onSubscriptionChanged?.();
  };

  const current = mine?.subscription ?? null;

  return (
    <div className="plan-page">
      <header className="page-hero page-hero-compact">
        <h1>{t('plan.title')}</h1>
        <p>{t('plan.subtitle')}</p>
      </header>

      {feature && !mine?.active && !mine?.collaborator && (
        <p className="plan-feature" role="status">
          {t('plan.featureNotice', { feature: t(`plan.features.${feature}`) })}
        </p>
      )}

      <p className="plan-simulated">{t('plan.simulated')}</p>

      {loadError && (
        <p className="form-error" role="alert">
          {t(`authErrors.${loadError}`)}
        </p>
      )}

      {done && (
        <p ref={status} tabIndex={-1} className="form-success" role="status">
          {done}
        </p>
      )}

      {mine && (
        <section className="profile-panel plan-current" aria-labelledby="plan-current-title">
          <h2 id="plan-current-title">{t('plan.current.title')}</h2>
          {mine.collaborator ? (
            <p>{t('plan.current.collaborator')}</p>
          ) : current ? (
            <>
              <p className="plan-current-name">
                <LockSimpleOpen weight="bold" aria-hidden="true" />
                {planName(current.plan)}
              </p>
              <p>
                {current.autoRenew
                  ? t('plan.current.renews', { date: date(current.endsAt) })
                  : t('plan.current.ends', { date: date(current.endsAt) })}
              </p>
              <div className="form-actions">
                {current.autoRenew ? (
                  <button
                    type="button"
                    className="pill pill-ghost pill-small"
                    disabled={busy}
                    onClick={() => {
                      setDone(null);
                      setError(null);
                      setConfirming({ kind: 'cancel' });
                    }}
                    {...needs.props}
                  >
                    {t('plan.cancel')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pill pill-primary pill-small"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => window.api.subscription.resume(),
                        (data) =>
                          t('plan.resumed', {
                            date: date(data.subscription?.endsAt ?? current.endsAt),
                          }),
                      )
                    }
                    {...needs.props}
                  >
                    {t('plan.resume')}
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="plan-current-name">{planName('gratuito')}</p>
          )}

          {confirming?.kind === 'cancel' && current && (
            <div className="danger-zone" role="alertdialog" aria-label={t('plan.cancel')}>
              <p className="danger-warning">
                {t('plan.cancelConfirm', { date: date(current.endsAt) })}
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {t(`authErrors.${error}`)}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="pill pill-danger pill-small"
                  disabled={busy}
                  autoFocus
                  onClick={() =>
                    void act(
                      () => window.api.subscription.cancel(),
                      () => t('plan.cancelled', { date: date(current.endsAt) }),
                    )
                  }
                  {...needs.props}
                >
                  {t('plan.cancelButton')}
                </button>
                <button
                  type="button"
                  className="pill pill-ghost pill-small"
                  onClick={() => setConfirming(null)}
                >
                  {t('plan.keep')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {plans && (
        <section aria-labelledby="plan-list-title">
          <h2 id="plan-list-title" className="section-label">
            {t('plan.list')}
          </h2>
          <ul className="plan-grid">
            {plans.map((plan) => {
              const isCurrent = current ? current.plan === plan.code : plan.code === 'gratuito';
              return (
                <li
                  key={plan.code}
                  className={`plan-card${isCurrent && !mine?.collaborator ? ' is-current' : ''}`}
                >
                  <h3>{planName(plan.code)}</h3>
                  <p className="plan-price">
                    {plan.priceCents === 0
                      ? t('plan.free')
                      : t(`plan.per.${plan.code}`, {
                          price: formatPlanPrice(plan.priceCents, i18n.language),
                        })}
                  </p>
                  <ul className="plan-includes">
                    {(isPaidPlanCode(plan.code)
                      ? ['everything', 'portfolio_comparison', 'portfolio_report']
                      : ['portfolios', 'performance', 'news']
                    ).map((item) => (
                      <li key={item}>
                        <Check weight="bold" aria-hidden="true" />
                        {t(`plan.includes.${item}`)}
                      </li>
                    ))}
                  </ul>
                  {isCurrent && !mine?.collaborator && (
                    <p className="plan-badge">{t('plan.yours')}</p>
                  )}
                  {isPaidPlanCode(plan.code) && mine && !mine.collaborator && !current && (
                    <button
                      type="button"
                      className="pill pill-primary"
                      disabled={busy}
                      onClick={() => {
                        setDone(null);
                        setError(null);
                        setConfirming({
                          kind: 'subscribe',
                          plan: plan as Plan & { code: PaidPlanCode },
                        });
                      }}
                      {...needs.props}
                    >
                      {t('plan.subscribe', { plan: planName(plan.code) })}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {confirming?.kind === 'subscribe' && (
        <div
          className="danger-zone plan-confirm"
          role="alertdialog"
          aria-label={t('plan.confirmTitle')}
        >
          <p>
            <strong>{t('plan.confirmTitle')}</strong>{' '}
            {t('plan.confirmText', {
              plan: planName(confirming.plan.code),
              price: formatPlanPrice(confirming.plan.priceCents, i18n.language),
              days: confirming.plan.durationDays ?? 0,
            })}
          </p>
          <p className="field-hint">{t('plan.simulated')}</p>
          {error && (
            <p className="form-error" role="alert">
              {t(`authErrors.${error}`)}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="pill pill-primary pill-small"
              disabled={busy}
              autoFocus
              onClick={() =>
                void act(
                  () => window.api.subscription.subscribe(confirming.plan.code),
                  (data) =>
                    t('plan.subscribed', {
                      plan: planName(confirming.plan.code),
                      date: date(data.subscription?.endsAt ?? new Date().toISOString()),
                    }),
                )
              }
              {...needs.props}
            >
              {t('plan.confirm')}
            </button>
            <button
              type="button"
              className="pill pill-ghost pill-small"
              onClick={() => setConfirming(null)}
            >
              {t('plan.back')}
            </button>
          </div>
        </div>
      )}

      {mine && mine.payments.length > 0 && (
        <section className="profile-panel" aria-labelledby="plan-payments-title">
          <h2 id="plan-payments-title">{t('plan.payments.title')}</h2>
          <div className="table-scroll">
            <table className="plan-payments">
              <thead>
                <tr>
                  <th scope="col">{t('plan.payments.period')}</th>
                  <th scope="col">{t('plan.payments.plan')}</th>
                  <th scope="col">{t('plan.payments.amount')}</th>
                  <th scope="col">{t('plan.payments.status')}</th>
                </tr>
              </thead>
              <tbody>
                {mine.payments.map((payment) => (
                  <tr key={payment.periodStart}>
                    <td>
                      {t('plan.payments.range', {
                        from: date(payment.periodStart),
                        to: date(payment.periodEnd),
                      })}
                    </td>
                    <td>{planName(payment.plan)}</td>
                    <td>{formatPlanPrice(payment.amountCents, i18n.language)}</td>
                    <td>{t('plan.payments.approved')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
