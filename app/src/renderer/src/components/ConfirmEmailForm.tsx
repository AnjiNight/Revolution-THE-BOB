import {
  EMAIL_CODE_RESEND_SECONDS,
  emailConfirmationSchema,
  validate,
  type FieldErrors,
  type PublicUser,
} from '@simulador/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { emailLocale } from '../format';
import { useCountdown } from '../useCountdown';
import { TextField } from './TextField';

interface ConfirmEmailFormProps {
  email: string;
  /** `signup`: acabou de se cadastrar. `login`: tentou entrar com a conta ainda pendente. */
  reason: 'signup' | 'login';
  /** Código certo: a conta foi liberada e a sessão aberta. */
  onSuccess: (user: PublicUser) => void;
  /** Volta ao cadastro com os dados preenchidos, para corrigir um e-mail digitado errado. */
  onFixEmail: () => void;
  onBack: () => void;
}

/**
 * Confirme seu e-mail (SPEC-039 §5.2). O servidor já mandou o código quando esta tela abre
 * (cadastro ou login de conta pendente); o código só existe no estado da tela.
 */
export function ConfirmEmailForm({
  email,
  reason,
  onSuccess,
  onFixEmail,
  onBack,
}: ConfirmEmailFormProps) {
  const { t, i18n } = useTranslation();
  const [code, setCode] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError | undefined>();
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useCountdown(EMAIL_CODE_RESEND_SECONDS);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.querySelector('input')?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = validate(emailConfirmationSchema, { email, code });
    if (!checked.success) {
      setFields(checked.fields);
      setError(undefined);
      return;
    }
    setFields({});
    setError(undefined);
    setSubmitting(true);
    const result = await window.api.auth.confirmEmail(checked.data);
    setSubmitting(false);
    if (result.ok) return onSuccess(result.user);
    setError(result.error);
    setFields(result.fields ?? {});
  };

  const resend = async () => {
    setError(undefined);
    setCode('');
    setSubmitting(true);
    const result = await window.api.auth.resendConfirmation({
      email,
      locale: emailLocale(i18n.language),
    });
    setSubmitting(false);
    if (!result.ok) return setError(result.error);
    setResent(true);
    setWaitSeconds(EMAIL_CODE_RESEND_SECONDS);
  };

  const message = resent
    ? t('reset.resent')
    : reason === 'login'
      ? t('confirm.pendingLogin', { email })
      : t('confirm.sent', { email });

  return (
    <form ref={form} className="card auth-form" onSubmit={(event) => void submit(event)} noValidate>
      <h2>{t('confirm.title')}</h2>
      <p className="reset-sent" role="status">
        {message}
      </p>

      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}

      <TextField
        label={t('reset.code')}
        type="text"
        value={code}
        onChange={setCode}
        autoComplete="one-time-code"
        spellCheck={false}
        hint={t('reset.codeHint')}
        error={fields.code}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? t('auth.submitting') : t('confirm.submit')}
      </button>

      <p className="switch reset-actions">
        <button
          type="button"
          className="link"
          disabled={submitting || waitSeconds > 0}
          onClick={() => void resend()}
        >
          {waitSeconds > 0 ? t('reset.resendIn', { seconds: waitSeconds }) : t('reset.resend')}
        </button>
        {reason === 'signup' && (
          <button type="button" className="link" disabled={submitting} onClick={onFixEmail}>
            {t('confirm.fixEmail')}
          </button>
        )}
      </p>

      <p className="switch">
        <button type="button" className="link" onClick={onBack}>
          {t('reset.back')}
        </button>
      </p>
    </form>
  );
}
