import { loginSchema, validate, type FieldErrors, type PublicUser } from '@simulador/shared';
import { CheckCircle } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { TextField } from './TextField';

interface CollaboratorLoginFormProps {
  /** E-mail já preenchido (ex.: depois de redefinir a senha). */
  initialEmail?: string | undefined;
  /** Mostra o aviso de senha redefinida (SPEC-004). */
  passwordReset?: boolean | undefined;
  onSuccess: (user: PublicUser) => void;
  onForgotPassword: (email: string) => void;
  onBack: () => void;
}

/** Área do colaborador (SPEC-002 §4): login próprio, sem cadastro e sem Google. */
export function CollaboratorLoginForm({
  initialEmail,
  passwordReset,
  onSuccess,
  onForgotPassword,
  onBack,
}: CollaboratorLoginFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError | undefined>();
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
    const result = await window.api.auth.collaboratorLogin(checked.data);
    setSubmitting(false);
    if (result.ok) return onSuccess(result.user);
    setError(result.error);
    setFields(result.fields ?? {});
  };

  return (
    <form
      className="card auth-form collaborator"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <h2>{t('auth.collaboratorTitle')}</h2>
      <p className="field-hint">{t('auth.collaboratorNote')}</p>
      {passwordReset && !error && (
        <p className="form-success" role="status">
          <CheckCircle weight="fill" aria-hidden="true" />
          {t('reset.done')}
        </p>
      )}
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
        autoComplete="username"
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
      <p className="forgot">
        <button type="button" className="link" onClick={() => onForgotPassword(email)}>
          {t('auth.forgotPassword')}
        </button>
      </p>
      <button type="submit" disabled={submitting}>
        {submitting ? t('auth.submitting') : t('auth.submitLogin')}
      </button>
      <p className="switch">
        <button type="button" className="link" onClick={onBack}>
          {t('auth.backToLogin')}
        </button>
      </p>
    </form>
  );
}
