import {
  changeEmailSchema,
  changePasswordSchema,
  TERMS_VERSION,
  updateNameSchema,
  validate,
  type ConsentList,
  type FieldErrors,
  type UserProfile,
} from '@simulador/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError, ClientResult } from '../../../shared/auth-ipc';
import { TextField } from './TextField';

interface ProfileProps {
  onBack: () => void;
  /** Nome ou e-mail mudou: atualiza o restante do app. */
  onUserChanged: (user: UserProfile) => void;
  /** A sessão caiu durante uma chamada: volta para o login. */
  onSessionExpired: () => void;
}

/** Tela Meu perfil (SPEC-003 §5.2). */
export function Profile({ onBack, onUserChanged, onSessionExpired }: ProfileProps) {
  const { t } = useTranslation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [consents, setConsents] = useState<ConsentList | null>(null);
  const [error, setError] = useState<ClientAuthError | undefined>();

  useEffect(() => {
    void (async () => {
      const profile = await window.api.profile.get();
      if (!profile.ok) {
        if (profile.error === 'unauthorized') return onSessionExpired();
        return setError(profile.error);
      }
      setUser(profile.data);
      if (profile.data.role === 'user') {
        const list = await window.api.profile.listConsents();
        if (list.ok) setConsents(list.data);
      }
    })();
  }, [onSessionExpired]);

  const changed = (next: UserProfile) => {
    setUser(next);
    onUserChanged(next);
  };

  return (
    <section className="card profile" aria-labelledby="profile-title">
      <div className="profile-header">
        <h2 id="profile-title">{t('profile.title')}</h2>
        <button type="button" className="link" onClick={onBack}>
          {t('profile.back')}
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}
      {!user && !error && <p className="loading">{t('loading')}</p>}

      {user && (
        <>
          <dl className="profile-summary">
            <dt>{t('profile.accountType')}</dt>
            <dd>{t(`home.role.${user.role}`)}</dd>
            <dt>{t('profile.signInMethods')}</dt>
            <dd>
              {[user.hasPassword && t('profile.methodPassword'), user.hasGoogle && 'Google']
                .filter(Boolean)
                .join(' + ')}
            </dd>
            <dt>{t('profile.createdAt')}</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
          </dl>

          <NameForm user={user} onSaved={changed} onSessionExpired={onSessionExpired} />
          {user.hasPassword ? (
            <>
              <EmailForm user={user} onSaved={changed} onSessionExpired={onSessionExpired} />
              <PasswordForm onSessionExpired={onSessionExpired} />
            </>
          ) : (
            <p className="field-hint">{t('profile.googleOnly', { email: user.email })}</p>
          )}
          {consents && (
            <Consents
              list={consents}
              onAccepted={setConsents}
              onSessionExpired={onSessionExpired}
            />
          )}
        </>
      )}
    </section>
  );
}

interface FormState {
  fields: FieldErrors;
  error?: ClientAuthError | undefined;
  saved: boolean;
  submitting: boolean;
}

const IDLE: FormState = { fields: {}, saved: false, submitting: false };

/** Envia o formulário e traduz o resultado em estado da tela. */
function useSubmit(onSessionExpired: () => void) {
  const [state, setState] = useState<FormState>(IDLE);
  const submit = async <T,>(
    checked: { success: true; data: unknown } | { success: false; fields: FieldErrors },
    send: () => Promise<ClientResult<T>>,
    onOk: (data: T) => void,
  ) => {
    if (!checked.success) return setState({ ...IDLE, fields: checked.fields });
    setState({ ...IDLE, submitting: true });
    const result = await send();
    if (result.ok) {
      onOk(result.data);
      return setState({ ...IDLE, saved: true });
    }
    if (result.error === 'unauthorized') return onSessionExpired();
    setState({ ...IDLE, error: result.error, fields: result.fields ?? {} });
  };
  return { state, submit };
}

function Section({
  title,
  state,
  savedText,
  onSubmit,
  children,
}: {
  title: string;
  state: FormState;
  savedText: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const handle = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="profile-section" onSubmit={handle} noValidate>
      <h3>{title}</h3>
      {state.error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {children}
      <button type="submit" disabled={state.submitting}>
        {state.submitting ? t('auth.submitting') : t('profile.save')}
      </button>
      {state.saved && (
        <p className="form-success" role="status">
          {savedText}
        </p>
      )}
    </form>
  );
}

interface UserFormProps {
  user: UserProfile;
  onSaved: (user: UserProfile) => void;
  onSessionExpired: () => void;
}

function NameForm({ user, onSaved, onSessionExpired }: UserFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const { state, submit } = useSubmit(onSessionExpired);
  return (
    <Section
      title={t('profile.nameSection')}
      state={state}
      savedText={t('profile.saved')}
      onSubmit={() =>
        void submit(
          validate(updateNameSchema, { name }),
          () => window.api.profile.updateName({ name }),
          onSaved,
        )
      }
    >
      <TextField
        label={t('auth.name')}
        type="text"
        value={name}
        onChange={setName}
        autoComplete="name"
        error={state.fields.name}
      />
    </Section>
  );
}

function EmailForm({ user, onSaved, onSessionExpired }: UserFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const { state, submit } = useSubmit(onSessionExpired);
  return (
    <Section
      title={t('profile.emailSection')}
      state={state}
      savedText={t('profile.saved')}
      onSubmit={() =>
        void submit(
          validate(changeEmailSchema, { email, currentPassword }),
          () => window.api.profile.changeEmail({ email, currentPassword }),
          (next) => {
            setEmail(next.email);
            setCurrentPassword('');
            onSaved(next);
          },
        )
      }
    >
      <TextField
        label={t('profile.newEmail')}
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        error={state.fields.email}
      />
      <TextField
        label={t('profile.currentPassword')}
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        error={state.fields.currentPassword}
      />
    </Section>
  );
}

function PasswordForm({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { state, submit } = useSubmit(onSessionExpired);
  return (
    <Section
      title={t('profile.passwordSection')}
      state={state}
      savedText={t('profile.passwordChanged')}
      onSubmit={() =>
        void submit(
          validate(changePasswordSchema, { currentPassword, newPassword }),
          () => window.api.profile.changePassword({ currentPassword, newPassword }),
          () => {
            setCurrentPassword('');
            setNewPassword('');
          },
        )
      }
    >
      <TextField
        label={t('profile.currentPassword')}
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        error={state.fields.currentPassword}
      />
      <TextField
        label={t('profile.newPassword')}
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        hint={t('auth.passwordHint')}
        error={state.fields.newPassword}
      />
    </Section>
  );
}

/** Histórico de aceites (RNF11) e aviso quando há versão nova dos termos. */
function Consents({
  list,
  onAccepted,
  onSessionExpired,
}: {
  list: ConsentList;
  onAccepted: (list: ConsentList) => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const outdated = isTermsOutdated(list);
  const { state, submit } = useSubmit(onSessionExpired);
  return (
    <div className="profile-section">
      <h3>{t('profile.consentsSection')}</h3>
      <ul className="consent-list">
        {list.consents.map((consent) => (
          <li key={`${consent.version}-${consent.acceptedAt}`}>
            {t('profile.consentItem', {
              version: consent.version,
              date: new Date(consent.acceptedAt).toLocaleString(),
            })}
          </li>
        ))}
      </ul>
      {outdated && (
        <TermsUpdateNotice
          submitting={state.submitting}
          onAccept={() =>
            void submit(
              { success: true, data: null },
              () => window.api.profile.acceptTerms(),
              () => void window.api.profile.listConsents().then((r) => r.ok && onAccepted(r.data)),
            )
          }
        />
      )}
      <p className="field-hint">{t('profile.withdrawConsent')}</p>
    </div>
  );
}

export function isTermsOutdated(list: ConsentList): boolean {
  return list.consents.at(-1)?.version !== list.currentVersion;
}

export function TermsUpdateNotice({
  submitting,
  onAccept,
}: {
  submitting: boolean;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="terms-notice" role="alert">
      <p>{t('profile.termsUpdated')}</p>
      <details className="terms">
        <summary>{t('auth.termsTitle', { version: TERMS_VERSION })}</summary>
        <p>{t('auth.termsSummary')}</p>
      </details>
      <button type="button" disabled={submitting} onClick={onAccept}>
        {t('auth.continue')}
      </button>
    </div>
  );
}
