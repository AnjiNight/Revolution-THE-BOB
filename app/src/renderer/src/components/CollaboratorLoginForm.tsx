import { loginSchema, validate, type FieldErrors, type PublicUser } from '@simulador/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { TextField } from './TextField';

interface CollaboratorLoginFormProps {
  onSuccess: (user: PublicUser) => void;
  onBack: () => void;
}

/** Área do colaborador (SPEC-002 §4): login próprio, sem cadastro e sem Google. */
export function CollaboratorLoginForm({ onSuccess, onBack }: CollaboratorLoginFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
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
