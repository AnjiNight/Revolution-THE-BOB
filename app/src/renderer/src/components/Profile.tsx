import {
  changeEmailSchema,
  changePasswordSchema,
  confirmEmailChangeSchema,
  TERMS_VERSION,
  updateNameSchema,
  validate,
  type ConsentList,
  type FieldErrors,
  type UserProfile,
} from '@simulador/shared';
import { CheckCircle } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError, ClientResult } from '../../../shared/auth-ipc';
import { emailLocale, formatDate, initials } from '../format';
import { TextField } from './TextField';

interface ProfileProps {
  /** Nome ou e-mail mudou: atualiza o restante do app. */
  onUserChanged: (user: UserProfile) => void;
  /** A sessão caiu durante uma chamada: volta para o login. */
  onSessionExpired: () => void;
}

/** Tela Meu perfil (SPEC-003 §5.2): resumo da conta à esquerda, edições à direita. */
export function Profile({ onUserChanged, onSessionExpired }: ProfileProps) {
  const { t, i18n } = useTranslation();
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
    <div className="profile-view">
      <header className="page-hero page-hero-compact">
        <h1>{t('profile.title')}</h1>
        <p className="lead">{t('profile.subtitle')}</p>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}
      {!user && !error && <p className="loading">{t('loading')}</p>}

      {user && (
        <div className="profile-layout">
          <aside className="bezel profile-aside">
            <div className="bezel-core profile-identity">
              <span className="avatar avatar-lg" aria-hidden="true">
                {initials(user.name)}
              </span>
              <p className="profile-name">{user.name}</p>
              <p className="profile-email">{user.email}</p>
              <p className={user.role === 'collaborator' ? 'eyebrow eyebrow-warn' : 'eyebrow'}>
                {t(`profile.roleName.${user.role}`)}
              </p>
              <dl className="profile-summary">
                <dt>{t('profile.signInMethods')}</dt>
                <dd>
                  {[user.hasPassword && t('profile.methodPassword'), user.hasGoogle && 'Google']
                    .filter(Boolean)
                    .join(' + ')}
                </dd>
                <dt>{t('profile.createdAt')}</dt>
                <dd>{formatDate(user.createdAt, i18n.language)}</dd>
              </dl>
            </div>
          </aside>

          <div className="profile-sections">
            <EditableSection
              title={t('profile.nameSection')}
              value={user.name}
              editLabel={t('profile.editName')}
              savedText={t('profile.saved')}
            >
              {(done) => (
                <NameForm
                  user={user}
                  onSaved={changed}
                  onDone={done}
                  onSessionExpired={onSessionExpired}
                />
              )}
            </EditableSection>

            {user.hasPassword ? (
              <>
                <EditableSection
                  title={t('profile.emailSection')}
                  value={
                    <>
                      {user.email}
                      {user.pendingEmail && (
                        <span className="pending-hint">
                          {t('profile.pendingEmail', { email: user.pendingEmail })}
                        </span>
                      )}
                    </>
                  }
                  editLabel={t('profile.editEmail')}
                  savedText={t('profile.emailChanged')}
                >
                  {(done) => (
                    <EmailForm
                      user={user}
                      onSaved={changed}
                      onDone={done}
                      onSessionExpired={onSessionExpired}
                    />
                  )}
                </EditableSection>
                <EditableSection
                  title={t('profile.passwordSection')}
                  value={t('profile.passwordSummary')}
                  editLabel={t('profile.editPassword')}
                  savedText={t('profile.passwordChanged')}
                >
                  {(done) => <PasswordForm onDone={done} onSessionExpired={onSessionExpired} />}
                </EditableSection>
              </>
            ) : (
              <section className="profile-panel" aria-labelledby="google-account-title">
                <h2 id="google-account-title">{t('profile.googleAccount')}</h2>
                <p className="profile-value">{t('profile.googleOnly', { email: user.email })}</p>
              </section>
            )}

            {consents && (
              <Consents
                list={consents}
                onAccepted={setConsents}
                onSessionExpired={onSessionExpired}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fecha a edição; `saved` diz se foi por sucesso (mostra a confirmação) ou cancelamento. */
type Done = (saved: boolean) => void;

/**
 * Cartão com o valor atual e um botão que abre a edição. Ao abrir, o foco vai para o primeiro
 * campo; ao fechar, volta para o botão (navegação por teclado e leitor de tela).
 */
function EditableSection({
  title,
  value,
  editLabel,
  savedText,
  children,
}: {
  title: string;
  value: ReactNode;
  editLabel: string;
  savedText: string;
  children: (done: Done) => ReactNode;
}) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) panel.current?.querySelector('input')?.focus();
    else if (wasOpen.current) editButton.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const done: Done = (ok) => {
    setSaved(ok);
    setOpen(false);
  };

  return (
    <section ref={panel} className="profile-panel" aria-labelledby={headingId}>
      <div className="profile-panel-head">
        <div>
          <h2 id={headingId}>{title}</h2>
          {!open && <p className="profile-value">{value}</p>}
        </div>
        {!open && (
          <button
            ref={editButton}
            type="button"
            className="pill pill-ghost pill-small"
            onClick={() => {
              setSaved(false);
              setOpen(true);
            }}
          >
            {editLabel}
          </button>
        )}
      </div>
      {open && children(done)}
      {/* Região sempre presente: o leitor de tela anuncia quando a confirmação aparece. */}
      <p className="form-success" role="status">
        {saved && !open && (
          <>
            <CheckCircle weight="fill" aria-hidden="true" />
            {savedText}
          </>
        )}
      </p>
    </section>
  );
}

interface FormState {
  fields: FieldErrors;
  error?: ClientAuthError | undefined;
  submitting: boolean;
}

const IDLE: FormState = { fields: {}, submitting: false };

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
      setState(IDLE);
      return onOk(result.data);
    }
    if (result.error === 'unauthorized') return onSessionExpired();
    setState({ ...IDLE, error: result.error, fields: result.fields ?? {} });
  };
  return { state, submit };
}

/** Corpo do formulário de edição: erro geral, campos e as ações Salvar e Cancelar. */
function EditForm({
  state,
  saveLabel,
  onSubmit,
  onCancel,
  children,
}: {
  state: FormState;
  saveLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const handle = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="profile-form" onSubmit={handle} noValidate>
      {state.error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {children}
      <div className="form-actions">
        <button type="submit" disabled={state.submitting}>
          {state.submitting ? t('auth.submitting') : saveLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={state.submitting}>
          {t('auth.cancel')}
        </button>
      </div>
    </form>
  );
}

interface UserFormProps {
  user: UserProfile;
  onSaved: (user: UserProfile) => void;
  onDone: Done;
  onSessionExpired: () => void;
}

function NameForm({ user, onSaved, onDone, onSessionExpired }: UserFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const { state, submit } = useSubmit(onSessionExpired);
  return (
    <EditForm
      state={state}
      saveLabel={t('profile.saveName')}
      onCancel={() => onDone(false)}
      onSubmit={() =>
        void submit(
          validate(updateNameSchema, { name }),
          () => window.api.profile.updateName({ name }),
          (next) => {
            onSaved(next);
            onDone(true);
          },
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
    </EditForm>
  );
}

/**
 * Troca de e-mail em duas etapas (SPEC-039): e-mail novo + senha atual; depois, o código que
 * chegou no endereço novo. O e-mail da conta só muda na segunda etapa.
 */
function EmailForm({ user, onSaved, onDone, onSessionExpired }: UserFormProps) {
  const { t, i18n } = useTranslation();
  const locale = emailLocale(i18n.language);
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [email, setEmail] = useState(user.pendingEmail ?? user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const { state, submit } = useSubmit(onSessionExpired);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step === 'code') wrapper.current?.querySelector('input')?.focus();
  }, [step]);

  if (step === 'code') {
    return (
      <div ref={wrapper}>
        <EditForm
          state={state}
          saveLabel={t('profile.confirmEmail')}
          onCancel={() => onDone(false)}
          onSubmit={() => {
            // Envia o código já normalizado (minúsculas, hífen e espaços resolvidos).
            const checked = validate(confirmEmailChangeSchema, { code, locale });
            void submit(
              checked,
              () =>
                window.api.profile.confirmEmailChange(checked.success ? checked.data : { code }),
              (next) => {
                onSaved(next);
                onDone(true);
              },
            );
          }}
        >
          <p className="reset-sent" role="status">
            {t('profile.emailCodeSent', { email })}
          </p>
          <TextField
            label={t('reset.code')}
            type="text"
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            spellCheck={false}
            hint={t('reset.codeHint')}
            error={state.fields.code}
          />
        </EditForm>
      </div>
    );
  }

  const request = () => {
    const checked = validate(changeEmailSchema, { email, currentPassword, locale });
    // Mesmo e-mail de agora: não há o que confirmar.
    if (checked.success && checked.data.email === user.email && !user.pendingEmail) {
      return onDone(false);
    }
    void submit(
      checked,
      () => window.api.profile.changeEmail({ email, currentPassword, locale }),
      () => {
        if (!checked.success) return;
        setEmail(checked.data.email);
        setCurrentPassword('');
        if (checked.data.email === user.email) {
          onSaved({ ...user, pendingEmail: null });
          return onDone(false);
        }
        onSaved({ ...user, pendingEmail: checked.data.email });
        setStep('code');
      },
    );
  };

  return (
    <EditForm
      state={state}
      saveLabel={t('profile.saveEmail')}
      onCancel={() => onDone(false)}
      onSubmit={request}
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
    </EditForm>
  );
}

function PasswordForm({
  onDone,
  onSessionExpired,
}: {
  onDone: Done;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { state, submit } = useSubmit(onSessionExpired);
  return (
    <EditForm
      state={state}
      saveLabel={t('profile.savePassword')}
      onCancel={() => onDone(false)}
      onSubmit={() =>
        void submit(
          validate(changePasswordSchema, { currentPassword, newPassword }),
          () => window.api.profile.changePassword({ currentPassword, newPassword }),
          () => onDone(true),
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
    </EditForm>
  );
}

/** Histórico de aceites (RNF11), do mais recente para o mais antigo, e aviso de versão nova. */
function Consents({
  list,
  onAccepted,
  onSessionExpired,
}: {
  list: ConsentList;
  onAccepted: (list: ConsentList) => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const outdated = isTermsOutdated(list);
  const { state, submit } = useSubmit(onSessionExpired);
  const newestFirst = [...list.consents].reverse();
  return (
    <section className="profile-panel" aria-labelledby="consents-title">
      <h2 id="consents-title">{t('profile.consentsSection')}</h2>
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
      <ol className="consent-timeline">
        {newestFirst.map((consent, index) => (
          <li key={`${consent.version}-${consent.acceptedAt}`}>
            <span className="consent-dot" aria-hidden="true" />
            <div>
              <p className="consent-title">{t('profile.consentTitle')}</p>
              <p className="consent-meta">
                {t('profile.consentMeta', {
                  version: consent.version,
                  date: formatDate(consent.acceptedAt, i18n.language, true),
                })}
              </p>
            </div>
            {index === 0 && consent.version === list.currentVersion && (
              <span className="soon-badge current-badge">{t('profile.consentCurrent')}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="field-hint">{t('profile.withdrawConsent')}</p>
    </section>
  );
}

export function isTermsOutdated(list: ConsentList): boolean {
  return list.consents.at(-1)?.version !== list.currentVersion;
}

/** Aviso de termos novos. `role="status"`: informa sem interromper o leitor de tela. */
export function TermsUpdateNotice({
  submitting,
  onAccept,
}: {
  submitting: boolean;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="terms-notice" role="status">
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
