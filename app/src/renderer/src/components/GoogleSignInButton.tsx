import { TERMS_VERSION, type PublicUser } from '@simulador/shared';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';

interface GoogleSignInButtonProps {
  onSuccess: (user: PublicUser) => void;
  onError: (error: ClientAuthError | undefined) => void;
}

/** "Entrar com Google" (DA24), com o aceite dos termos no primeiro acesso (RNF11). */
export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const { t } = useTranslation();
  const termsId = useId();
  const [available, setAvailable] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [needsTerms, setNeedsTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    window.api.auth
      .googleAvailable()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const signIn = async () => {
    onError(undefined);
    setWaiting(true);
    const result = await window.api.auth.signInWithGoogle();
    setWaiting(false);
    if (result.ok) return onSuccess(result.user);
    if (result.error === 'terms_required') return setNeedsTerms(true);
    onError(result.error);
  };

  const acceptTerms = async () => {
    setWaiting(true);
    const result = await window.api.auth.acceptGoogleTerms();
    setWaiting(false);
    setNeedsTerms(false);
    setAccepted(false);
    if (result.ok) return onSuccess(result.user);
    onError(result.error);
  };

  if (needsTerms) {
    return (
      <section className="google-terms" aria-labelledby={`${termsId}-title`}>
        <h3 id={`${termsId}-title`}>{t('auth.googleTermsTitle')}</h3>
        <p>{t('auth.googleTermsIntro')}</p>
        <details className="terms" open>
          <summary>{t('auth.termsTitle', { version: TERMS_VERSION })}</summary>
          <p>{t('auth.termsSummary')}</p>
        </details>
        <div className="checkbox">
          <input
            id={termsId}
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <label htmlFor={termsId}>{t('auth.acceptTerms')}</label>
        </div>
        <div className="actions">
          <button type="button" disabled={!accepted || waiting} onClick={() => void acceptTerms()}>
            {waiting ? t('auth.submitting') : t('auth.continue')}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setNeedsTerms(false);
              onError('google_cancelled');
            }}
          >
            {t('auth.cancel')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <p className="divider">
        <span>{t('auth.or')}</span>
      </p>
      <button
        type="button"
        className="secondary google"
        onClick={() => void signIn()}
        disabled={waiting}
      >
        {waiting ? t('auth.googleWaiting') : t('auth.google')}
      </button>
    </>
  );
}
