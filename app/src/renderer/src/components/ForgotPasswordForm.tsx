import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  RESET_CODE_RESEND_SECONDS,
  validate,
  type EmailLocale,
  type FieldErrors,
} from '@simulador/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { TextField } from './TextField';

interface ForgotPasswordFormProps {
  /** E-mail já digitado na tela de entrada, para não pedir de novo. */
  initialEmail: string;
  /** Porta de onde a pessoa veio: é para ela que o app volta (SPEC-002, cada porta o seu tipo). */
  origin: 'user' | 'collaborator';
  /** Senha redefinida: volta para a tela de origem com o e-mail preenchido. */
  onDone: (email: string) => void;
  onBack: () => void;
}

type Step = 'email' | 'code';

/**
 * Recuperar senha (SPEC-004 §5.3), em dois passos: e-mail e, depois, código + nova senha.
 * O código só existe no estado desta tela; nada é guardado no dispositivo.
 */
export function ForgotPasswordForm({
  initialEmail,
  origin,
  onDone,
  onBack,
}: ForgotPasswordFormProps) {
  const { t, i18n } = useTranslation();
  const locale: EmailLocale = i18n.language.startsWith('en') ? 'en' : 'pt-BR';
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError | undefined>();
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  // A cada passo, o foco vai para o primeiro campo (teclado e leitor de tela).
  useEffect(() => {
    form.current?.querySelector('input')?.focus();
  }, [step]);

  // Contagem para liberar "Reenviar código".
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  const fail = (result: { error: ClientAuthError; fields?: FieldErrors }) => {
    setError(result.error);
    setFields(result.fields ?? {});
  };

  const sendCode = async (): Promise<boolean> => {
    const checked = validate(passwordResetRequestSchema, { email, locale });
    if (!checked.success) {
      setFields(checked.fields);
      setError(undefined);
      return false;
    }
    setFields({});
    setError(undefined);
    setSubmitting(true);
    const result = await window.api.auth.requestPasswordReset(checked.data);
    setSubmitting(false);
    if (!result.ok) {
      fail(result);
      return false;
    }
    setEmail(checked.data.email);
    setWaitSeconds(RESET_CODE_RESEND_SECONDS);
    return true;
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (await sendCode()) {
      setResent(false);
      setStep('code');
    }
  };

  const resend = async () => {
    setCode('');
    if (await sendCode()) setResent(true);
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    const checked = validate(passwordResetConfirmSchema, { email, code, newPassword, locale });
    if (!checked.success) {
      setFields(checked.fields);
      setError(undefined);
      return;
    }
    setFields({});
    setError(undefined);
    setSubmitting(true);
    const result = await window.api.auth.confirmPasswordReset(checked.data);
    setSubmitting(false);
    if (result.ok) return onDone(email);
    fail(result);
  };

  const backLabel = origin === 'collaborator' ? t('reset.backCollaborator') : t('reset.back');

  return (
    <form
      ref={form}
      className={`card auth-form reset-form${origin === 'collaborator' ? ' collaborator' : ''}`}
      onSubmit={(event) => void (step === 'email' ? submitEmail(event) : submitCode(event))}
      noValidate
    >
      <h2>{t('reset.title')}</h2>

      {step === 'email' ? (
        <p className="field-hint">{t('reset.intro')}</p>
      ) : (
        <p className="reset-sent" role="status">
          {resent ? t('reset.resent') : t('reset.codeSent', { email })}
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}

      {step === 'email' ? (
        <>
          <TextField
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            error={fields.email}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? t('auth.submitting') : t('reset.sendCode')}
          </button>
        </>
      ) : (
        <>
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
          <TextField
            label={t('reset.newPassword')}
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            hint={t('auth.passwordHint')}
            error={fields.newPassword}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? t('auth.submitting') : t('reset.submit')}
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
            <button
              type="button"
              className="link"
              disabled={submitting}
              onClick={() => {
                setCode('');
                setNewPassword('');
                setFields({});
                setError(undefined);
                setStep('email');
              }}
            >
              {t('reset.otherEmail')}
            </button>
          </p>
        </>
      )}

      <p className="switch">
        <button type="button" className="link" onClick={onBack}>
          {backLabel}
        </button>
      </p>
    </form>
  );
}
