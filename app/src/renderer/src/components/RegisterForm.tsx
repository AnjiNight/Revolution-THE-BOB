import {
  registerSchema,
  TERMS_VERSION,
  validate,
  type FieldErrors,
  type PublicUser,
} from '@simulador/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { emailLocale } from '../format';
import { GoogleSignInButton } from './GoogleSignInButton';
import { TextField } from './TextField';

interface RegisterFormProps {
  /** Dados já digitados (ex.: voltou da confirmação para corrigir o e-mail). */
  initialName?: string | undefined;
  initialEmail?: string | undefined;
  /** SPEC-039: conta criada pendente; o app mostra a tela de confirmação do e-mail. */
  onRegistered: (email: string, name: string) => void;
  /** Entrou com o Google (a conta já nasce confirmada). */
  onSuccess: (user: PublicUser) => void;
  onGoToLogin: () => void;
}

export function RegisterForm({
  initialName,
  initialEmail,
  onRegistered,
  onSuccess,
  onGoToLogin,
}: RegisterFormProps) {
  const { t, i18n } = useTranslation();
  const termsId = useId();
  const [name, setName] = useState(initialName ?? '');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = validate(registerSchema, {
      name,
      email,
      password,
      acceptedTerms,
      locale: emailLocale(i18n.language),
    });
    if (!checked.success) {
      setFields(checked.fields);
      setError(undefined);
      return;
    }
    setFields({});
    setSubmitting(true);
    const result = await window.api.auth.register(checked.data);
    setSubmitting(false);
    if (result.ok) return onRegistered(checked.data.email, checked.data.name);
    setError(result.error);
    setFields(result.fields ?? {});
  };

  return (
    <form className="card auth-form" onSubmit={(event) => void submit(event)} noValidate>
      <h2>{t('auth.registerTitle')}</h2>
      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}
      <TextField
        label={t('auth.name')}
        type="text"
        value={name}
        onChange={setName}
        autoComplete="name"
        error={fields.name}
      />
      <TextField
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        error={fields.email}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={t('auth.passwordHint')}
        error={fields.password}
      />

      <details className="terms">
        <summary>{t('auth.termsTitle', { version: TERMS_VERSION })}</summary>
        <p>{t('auth.termsSummary')}</p>
      </details>
      <div className="checkbox">
        <input
          id={termsId}
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          aria-invalid={fields.acceptedTerms ? true : undefined}
        />
        <label htmlFor={termsId}>{t('auth.acceptTerms')}</label>
      </div>
      {fields.acceptedTerms && (
        <p className="field-error">{t(`fieldErrors.${fields.acceptedTerms}`)}</p>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? t('auth.submitting') : t('auth.submitRegister')}
      </button>
      <GoogleSignInButton onSuccess={onSuccess} onError={setError} />
      <p className="switch">
        {t('auth.haveAccount')}{' '}
        <button type="button" className="link" onClick={onGoToLogin}>
          {t('auth.goToLogin')}
        </button>
      </p>
    </form>
  );
}
