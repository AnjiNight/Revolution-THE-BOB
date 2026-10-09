import { loginSchema, validate, type FieldErrors, type PublicUser } from '@simulador/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { GoogleSignInButton } from './GoogleSignInButton';
import { TextField } from './TextField';

interface LoginFormProps {
  notice?: ClientAuthError | undefined;
  onSuccess: (user: PublicUser) => void;
  onGoToRegister: () => void;
  onGoToCollaborator: () => void;
}

export function LoginForm({
  notice,
  onSuccess,
  onGoToRegister,
  onGoToCollaborator,
}: LoginFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError | undefined>(notice);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = validate(loginSchema, { email, password });
    if (!checked.success) {
      setFields(checked.fields);
      setError(undefined);
      return;
    }
    setFields({});
    setSubmitting(true);
    const result = await window.api.auth.login(checked.data);
    setSubmitting(false);
    if (result.ok) return onSuccess(result.user);
    setError(result.error);
    setFields(result.fields ?? {});
  };

  return (
    <form className="card auth-form" onSubmit={(event) => void submit(event)} noValidate>
      <h2>{t('auth.loginTitle')}</h2>
      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}
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
        autoComplete="current-password"
        error={fields.password}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? t('auth.submitting') : t('auth.submitLogin')}
      </button>
      <GoogleSignInButton onSuccess={onSuccess} onError={setError} />
      <p className="switch">
        {t('auth.noAccount')}{' '}
        <button type="button" className="link" onClick={onGoToRegister}>
          {t('auth.goToRegister')}
        </button>
      </p>
      <p className="switch">
        <button type="button" className="link" onClick={onGoToCollaborator}>
          {t('auth.goToCollaborator')}
        </button>
      </p>
    </form>
  );
}
