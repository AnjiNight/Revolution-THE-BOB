import {
  addDays,
  isoDateInBrasilia,
  PORTFOLIO_HISTORY_START,
  PORTFOLIO_NAME_MAX,
  type FieldErrors,
  type Portfolio,
  type PortfolioList,
  type PortfolioType,
} from '@simulador/shared';
import { ArrowLeft, Plus } from '@phosphor-icons/react';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import '../assets.css';
import '../portfolios.css';
import { formatCalendarDay } from '../format';
import { MoneyField } from './MoneyField';
import { PortfolioCash } from './PortfolioCash';
import { PortfolioPerformance } from './PortfolioPerformance';
import { PortfolioPositions } from './PortfolioPositions';
import type { TradeAsset } from './TradeForm';
import { TextField } from './TextField';

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; data: PortfolioList }
  | { status: 'failed'; error: ClientAuthError };

interface PortfoliosProps {
  onOpen: (id: string) => void;
  onSessionExpired: () => void;
  /** O Início pede para abrir já com o formulário de nova carteira. */
  startCreating?: boolean;
}

/**
 * Carteiras do usuário (SPEC-012 §5.2): lista da mais recente para a mais antiga, nova carteira
 * com a explicação dos dois tipos, renomear no lugar e excluir com confirmação.
 */
export function Portfolios({ onOpen, onSessionExpired, startCreating = false }: PortfoliosProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [creating, setCreating] = useState(startCreating);
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    void window.api.portfolios.list().then((result) => {
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', error: result.error },
      );
    });
  }, [onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const created = (portfolio: Portfolio) => {
    setCreating(false);
    onOpen(portfolio.id);
  };

  const deleted = (name: string) => {
    setNotice(t('portfolios.deleted', { name }));
    load();
    // Depois de excluir, o foco volta para a lista (SPEC-012 §5.2).
    heading.current?.focus();
  };

  const list = state.status === 'ready' ? state.data : null;
  const full = list !== null && list.portfolios.length >= list.limit;

  return (
    <div className="portfolios">
      <header className="page-hero">
        <h1 ref={heading} tabIndex={-1}>
          {t('portfolios.title')}
        </h1>
        <p className="lead">{t('portfolios.subtitle')}</p>
        {list && (
          <p className="field-hint">
            {t('portfolios.count', { count: list.portfolios.length, limit: list.limit })}
          </p>
        )}
        {!creating && list && (
          <button
            type="button"
            className="pill pill-primary"
            disabled={full}
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
          >
            {t('portfolios.new')}
            <span className="pill-icon" aria-hidden="true">
              <Plus weight="bold" />
            </span>
          </button>
        )}
        {full && <p className="field-hint">{t('authErrors.portfolio_limit_reached')}</p>}
      </header>

      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}

      {creating && (
        <NewPortfolioForm
          onCreated={created}
          onCancel={() => setCreating(false)}
          onSessionExpired={onSessionExpired}
        />
      )}

      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('portfolios.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {list && list.portfolios.length === 0 && !creating && (
        <p className="assets-empty">{t('portfolios.empty')}</p>
      )}
      {list && list.portfolios.length > 0 && (
        <ul className="portfolio-list">
          {list.portfolios.map((portfolio) => (
            <PortfolioRow
              key={portfolio.id}
              portfolio={portfolio}
              onOpen={() => onOpen(portfolio.id)}
              onChanged={load}
              onDeleted={() => deleted(portfolio.name)}
              onSessionExpired={onSessionExpired}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Simulação ao vivo" ou "Simulação histórica: resultado calculado com dados já conhecidos" (DA17). */
export function TypeLabel({ type }: { type: PortfolioType }) {
  const { t } = useTranslation();
  return (
    <span className={`portfolio-type portfolio-type-${type}`}>{t(`portfolios.label.${type}`)}</span>
  );
}

function NewPortfolioForm({
  onCreated,
  onCancel,
  onSessionExpired,
}: {
  onCreated: (portfolio: Portfolio) => void;
  onCancel: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const typeName = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<PortfolioType>('live');
  const [startDate, setStartDate] = useState('');
  const [initialAmount, setInitialAmount] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError | null>(null);
  const [saving, setSaving] = useState(false);
  // O último dia aceito é ontem ou antes: o servidor confere se foi dia de pregão.
  const lastDay = addDays(isoDateInBrasilia(new Date()), -1);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFields({});
    setError(null);
    setSaving(true);
    const result = await window.api.portfolios.create({
      name,
      type,
      ...(type === 'historical' ? { startDate } : {}),
      // SPEC-013: o campo de dinheiro já entrega o decimal da API ("5000.00").
      ...(initialAmount ? { initialAmount } : {}),
    });
    setSaving(false);
    if (result.ok) return onCreated(result.data);
    if (result.error === 'unauthorized') return onSessionExpired();
    if (result.fields) setFields(result.fields);
    if (result.error === 'portfolio_name_in_use') setFields({ name: 'duplicate' });
    setError(result.error);
  };

  return (
    <section className="profile-panel portfolio-new" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('portfolios.newTitle')}</h2>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          label={t('portfolios.name')}
          type="text"
          value={name}
          onChange={setName}
          autoComplete="off"
          error={fields.name === 'duplicate' ? undefined : fields.name}
          hint={t('portfolios.nameHint', { max: PORTFOLIO_NAME_MAX })}
        />
        {fields.name === 'duplicate' && (
          <p className="field-error">{t('authErrors.portfolio_name_in_use')}</p>
        )}

        <fieldset className="portfolio-types">
          <legend>{t('portfolios.type')}</legend>
          {(['live', 'historical'] as const).map((option) => (
            <label key={option} className={`type-card${type === option ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name={typeName}
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
              />
              <span className="type-card-title">{t(`portfolios.types.${option}.title`)}</span>
              <span className="type-card-text">{t(`portfolios.types.${option}.text`)}</span>
            </label>
          ))}
        </fieldset>
        {fields.type && <p className="field-error">{t(`fieldErrors.${fields.type}`)}</p>}

        {type === 'historical' && (
          <TextField
            label={t('portfolios.startDate')}
            type="date"
            value={startDate}
            onChange={setStartDate}
            autoComplete="off"
            min={PORTFOLIO_HISTORY_START}
            max={lastDay}
            error={fields.startDate}
            hint={t('portfolios.startDateHint', {
              first: formatCalendarDay(PORTFOLIO_HISTORY_START, i18n.language),
            })}
          />
        )}

        <MoneyField
          label={t('portfolios.initialAmount')}
          value={initialAmount}
          onChange={setInitialAmount}
          error={fields.initialAmount}
          hint={t('portfolios.initialAmountHint')}
        />

        {error && error !== 'validation_error' && error !== 'portfolio_name_in_use' && (
          <p className="form-error" role="alert">
            {t(`authErrors.${error}`)}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="pill pill-primary" disabled={saving}>
            {saving ? t('portfolios.creating') : t('portfolios.create')}
          </button>
          <button type="button" className="pill pill-ghost" onClick={onCancel}>
            {t('portfolios.cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}

function PortfolioRow({
  portfolio,
  onOpen,
  onChanged,
  onDeleted,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  onOpen: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(portfolio.name);
  const [error, setError] = useState<ClientAuthError | null>(null);
  const [fieldError, setFieldError] = useState<FieldErrors['name']>(undefined);
  const [busy, setBusy] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const nameId = useId();

  const cancel = () => {
    setMode('view');
    setName(portfolio.name);
    setError(null);
    setFieldError(undefined);
    requestAnimationFrame(() => renameButton.current?.focus());
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await window.api.portfolios.rename(portfolio.id, { name });
    setBusy(false);
    if (result.ok) {
      setMode('view');
      onChanged();
      return;
    }
    if (result.error === 'unauthorized') return onSessionExpired();
    setFieldError(result.fields?.name);
    setError(result.error);
  };

  const remove = async () => {
    setBusy(true);
    const result = await window.api.portfolios.delete(portfolio.id);
    setBusy(false);
    if (result.ok) return onDeleted();
    if (result.error === 'unauthorized') return onSessionExpired();
    setError(result.error);
  };

  return (
    <li className="portfolio-row">
      {mode === 'rename' ? (
        <form
          className="portfolio-rename"
          onSubmit={(event) => void rename(event)}
          onKeyDown={(event) => event.key === 'Escape' && cancel()}
        >
          <label htmlFor={nameId} className="visually-hidden">
            {t('portfolios.name')}
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={PORTFOLIO_NAME_MAX + 10}
            autoFocus
            aria-invalid={fieldError || error ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="pill pill-primary pill-small" disabled={busy}>
            {t('portfolios.save')}
          </button>
          <button type="button" className="pill pill-ghost pill-small" onClick={cancel}>
            {t('portfolios.cancel')}
          </button>
          {(fieldError || error) && (
            <p className="field-error" role="alert">
              {error && error !== 'validation_error'
                ? t(`authErrors.${error}`)
                : t(`fieldErrors.${fieldError ?? 'required'}`)}
            </p>
          )}
        </form>
      ) : (
        <div className="portfolio-row-main">
          <button type="button" className="link portfolio-open" onClick={onOpen}>
            {portfolio.name}
          </button>
          <p className="portfolio-meta">
            <TypeLabel type={portfolio.type} />
            <span>
              {t('portfolios.since', {
                date: formatCalendarDay(portfolio.startDate, i18n.language),
              })}
            </span>
          </p>
        </div>
      )}

      {mode === 'view' && (
        <div className="portfolio-actions">
          <button
            ref={renameButton}
            type="button"
            className="pill pill-ghost pill-small"
            aria-label={t('portfolios.renameLabel', { name: portfolio.name })}
            onClick={() => setMode('rename')}
          >
            {t('portfolios.rename')}
          </button>
          <button
            type="button"
            className="pill pill-ghost pill-small"
            aria-label={t('portfolios.deleteLabel', { name: portfolio.name })}
            onClick={() => setMode('delete')}
          >
            {t('portfolios.delete')}
          </button>
        </div>
      )}

      {mode === 'delete' && (
        <div className="danger-zone" role="alertdialog" aria-label={t('portfolios.delete')}>
          <p className="danger-warning">
            {t('portfolios.deleteConfirm', { name: portfolio.name })}
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
              onClick={() => void remove()}
            >
              {t('portfolios.deleteButton')}
            </button>
            <button type="button" className="pill pill-ghost pill-small" onClick={cancel}>
              {t('portfolios.cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Tela de uma carteira (SPEC-012 §5.2): nome, rótulo do tipo e data de início; o caixa com o
 * extrato (SPEC-013) e, na ao vivo, as posições com a compra e venda (SPEC-014).
 */
export function PortfolioPage({
  portfolioId,
  buyAsset = null,
  onBack,
  onOpenAsset,
  onSessionExpired,
}: {
  portfolioId: string;
  /** SPEC-014: a ficha do ativo pediu para comprar este ativo aqui. */
  buyAsset?: TradeAsset | null;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  // Cada lançamento novo (aporte, retirada, compra ou venda) recarrega o caixa e as posições.
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((current) => current + 1), []);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; portfolio: Portfolio }
    | { status: 'failed'; error: ClientAuthError }
  >({ status: 'loading' });
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    void window.api.portfolios.get(portfolioId).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', portfolio: result.data }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [portfolioId, onSessionExpired]);

  useEffect(() => {
    if (state.status === 'ready') heading.current?.focus();
  }, [state.status]);

  return (
    <div className="portfolio-page">
      <button type="button" className="link asset-detail-back" onClick={onBack}>
        <ArrowLeft weight="bold" aria-hidden="true" />
        {t('portfolios.back')}
      </button>
      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('portfolios.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <header className="page-hero">
            <h1 ref={heading} tabIndex={-1}>
              {state.portfolio.name}
            </h1>
            <p className="portfolio-meta">
              <TypeLabel type={state.portfolio.type} />
              <span>
                {t('portfolios.since', {
                  date: formatCalendarDay(state.portfolio.startDate, i18n.language),
                })}
              </span>
            </p>
          </header>
          {/*
            Reordenação de 09/11/2026 (Luís): do que mais se consulta para o que menos se consulta.
            No topo, o saldo com Aportar e Retirar; depois a rentabilidade (SPEC-019), as posições
            com a distribuição (SPECs 014 e 021) e, no fim, o extrato (SPECs 013, 015 e 043).
          */}
          <PortfolioCash
            part="summary"
            portfolio={state.portfolio}
            version={version}
            onChanged={changed}
            onSessionExpired={onSessionExpired}
          />
          <PortfolioPerformance
            portfolio={state.portfolio}
            version={version}
            onSessionExpired={onSessionExpired}
          />
          {/* SPEC-016: a histórica também compra e vende, com a data escolhida. */}
          <PortfolioPositions
            portfolio={state.portfolio}
            version={version}
            startBuying={buyAsset}
            onChanged={changed}
            onOpenAsset={onOpenAsset}
            onSessionExpired={onSessionExpired}
          />
          <PortfolioCash
            part="statement"
            portfolio={state.portfolio}
            version={version}
            onChanged={changed}
            onSessionExpired={onSessionExpired}
          />
        </>
      )}
    </div>
  );
}
