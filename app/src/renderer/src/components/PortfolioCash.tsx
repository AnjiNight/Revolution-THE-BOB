import {
  addDays,
  CALENDAR_TIME_ZONE,
  isoDateInBrasilia,
  validateNewCashEntry,
  type CashEntry,
  type CashEntryResult,
  type CashEntryType,
  type CashStatement,
  type FieldErrors,
  type IsoDate,
  type Portfolio,
} from '@simulador/shared';
import { ArrowDown, ArrowUp } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { formatCalendarDay, formatMoney } from '../format';
import { MoneyField } from './MoneyField';
import { TextField } from './TextField';

type CashState =
  | { status: 'loading' }
  | { status: 'ready'; data: CashStatement }
  | { status: 'failed'; error: ClientAuthError };

/**
 * Caixa da carteira (SPEC-013 §5.2): saldo em destaque, Aportar e Retirar com confirmação e o
 * extrato do mais recente ao mais antigo, com o saldo depois de cada lançamento. Desde a SPEC-014,
 * o extrato também mostra as compras e vendas.
 */
export function PortfolioCash({
  portfolio,
  version,
  onChanged,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  /** Muda a cada lançamento novo (aqui ou numa compra ou venda): o extrato é pedido de novo. */
  version: number;
  onChanged: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<CashState>({ status: 'loading' });
  const [mode, setMode] = useState<CashEntryType | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const depositButton = useRef<HTMLButtonElement>(null);
  const withdrawButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const statementId = useId();
  const language = i18n.language;

  useEffect(() => {
    let active = true;
    void window.api.portfolios.cash(portfolio.id).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [portfolio.id, onSessionExpired, version]);

  const data = state.status === 'ready' ? state.data : null;

  const showMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    const result = await window.api.portfolios.cash(portfolio.id, data.entries.length);
    setLoadingMore(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setState({ status: 'failed', error: result.error });
    }
    setState({
      status: 'ready',
      data: { ...result.data, entries: [...data.entries, ...result.data.entries] },
    });
  };

  /** Fecha o formulário e devolve o foco ao botão que o abriu. */
  const close = (type: CashEntryType) => {
    setMode(null);
    requestAnimationFrame(() =>
      (type === 'deposit' ? depositButton : withdrawButton).current?.focus(),
    );
  };

  const registered = (type: CashEntryType, result: CashEntryResult) => {
    setNotice(
      t(type === 'deposit' ? 'portfolios.cash.deposited' : 'portfolios.cash.withdrawn', {
        balance: formatMoney(result.balance, language),
      }),
    );
    close(type);
    onChanged();
  };

  // Histórica (RB25): do início da carteira ou do último lançamento, o que vier depois.
  const lastDate = data?.entries[0]?.date;
  const firstDay = lastDate && lastDate > portfolio.startDate ? lastDate : portfolio.startDate;

  return (
    <section className="profile-panel cash-panel" aria-labelledby={titleId}>
      <div className="cash-head">
        <div>
          <h2 id={titleId}>{t('portfolios.cash.title')}</h2>
          {data && (
            <p className="cash-balance">
              <span>{t('portfolios.cash.balance')}</span>
              <strong>{formatMoney(data.balance, language)}</strong>
            </p>
          )}
        </div>
        {data && !mode && (
          <div className="cash-actions">
            <button
              ref={depositButton}
              type="button"
              className="pill pill-primary"
              onClick={() => {
                setNotice(null);
                setMode('deposit');
              }}
            >
              {t('portfolios.cash.deposit')}
              <span className="pill-icon" aria-hidden="true">
                <ArrowDown weight="bold" />
              </span>
            </button>
            <button
              ref={withdrawButton}
              type="button"
              className="pill pill-ghost"
              onClick={() => {
                setNotice(null);
                setMode('withdrawal');
              }}
            >
              {t('portfolios.cash.withdraw')}
              <span className="pill-icon" aria-hidden="true">
                <ArrowUp weight="bold" />
              </span>
            </button>
          </div>
        )}
      </div>

      {mode && data && (
        <CashEntryForm
          portfolio={portfolio}
          type={mode}
          firstDay={firstDay}
          onRegistered={(result) => registered(mode, result)}
          onCancel={() => close(mode)}
          onSessionExpired={onSessionExpired}
        />
      )}

      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}

      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('portfolios.cash.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {data && data.total === 0 && <p className="assets-empty">{t('portfolios.cash.empty')}</p>}

      {data && data.total > 0 && (
        <div className="cash-statement-block">
          <h3 id={statementId}>{t('portfolios.cash.statement')}</h3>
          <table className="cash-statement" aria-labelledby={statementId}>
            <thead>
              <tr>
                <th scope="col">{t('portfolios.cash.columns.date')}</th>
                <th scope="col">{t('portfolios.cash.columns.type')}</th>
                <th scope="col" className="cash-number">
                  {t('portfolios.cash.columns.amount')}
                </th>
                <th scope="col" className="cash-number">
                  {t('portfolios.cash.columns.balanceAfter')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <StatementRow key={entry.id} entry={entry} live={portfolio.type === 'live'} />
              ))}
            </tbody>
          </table>
          <p className="field-hint">
            {t('portfolios.cash.count', { shown: data.entries.length, count: data.total })}
          </p>
          {data.hasMore && (
            <button
              type="button"
              className="pill pill-ghost"
              disabled={loadingMore}
              onClick={() => void showMore()}
            >
              {t('portfolios.cash.showMore')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function StatementRow({ entry, live }: { entry: CashEntry; live: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const day = formatCalendarDay(entry.date, language);
  // Na ao vivo, a hora do registro em Brasília; na histórica, só o dia escolhido.
  const time = live
    ? new Intl.DateTimeFormat(language, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: CALENDAR_TIME_ZONE,
      }).format(new Date(entry.recordedAt))
    : null;
  // Entra no caixa: aporte e venda; sai: retirada e compra.
  const sign = entry.type === 'deposit' || entry.type === 'sell' ? '+' : '−';
  return (
    <tr>
      <td data-label={t('portfolios.cash.columns.date')}>{time ? `${day}, ${time}` : day}</td>
      <td data-label={t('portfolios.cash.columns.type')}>
        {t(`portfolios.cash.types.${entry.type}`)}
        {entry.trade && (
          <span className="cash-trade">
            {t('portfolios.cash.tradeDetail', {
              quantity: new Intl.NumberFormat(language).format(entry.trade.quantity),
              ticker: entry.trade.ticker,
              price: formatMoney(entry.trade.price, language),
            })}
          </span>
        )}
      </td>
      <td
        data-label={t('portfolios.cash.columns.amount')}
        className={`cash-number cash-${entry.type === 'sell' ? 'deposit' : entry.type}`}
      >
        {sign}
        {formatMoney(entry.amount, language)}
      </td>
      <td data-label={t('portfolios.cash.columns.balanceAfter')} className="cash-number">
        {formatMoney(entry.balanceAfter, language)}
      </td>
    </tr>
  );
}

function CashEntryForm({
  portfolio,
  type,
  firstDay,
  onRegistered,
  onCancel,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  type: CashEntryType;
  firstDay: IsoDate;
  onRegistered: (result: CashEntryResult) => void;
  onCancel: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const questionId = useId();
  const warningId = useId();
  // Decimal da API ("1234.56"): o campo de dinheiro já entrega assim.
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [fields, setFields] = useState<FieldErrors>({});
  const [available, setAvailable] = useState<string | null>(null);
  const [error, setError] = useState<ClientAuthError | null>(null);
  const [saving, setSaving] = useState(false);
  const historical = portfolio.type === 'historical';
  // O último dia aceito é ontem ou antes: o servidor confere se foi dia de pregão.
  const lastDay = addDays(isoDateInBrasilia(new Date()), -1);

  /** Confere o que dá para conferir aqui e mostra a confirmação (SPEC-013 §4.2). */
  const review = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setAvailable(null);
    const checked = validateNewCashEntry({
      type,
      amount,
      ...(historical && date ? { date } : {}),
    });
    const problems: FieldErrors = checked.success ? {} : { ...checked.fields };
    if (historical && !date) problems.date = 'required';
    setFields(problems);
    if (Object.keys(problems).length > 0) return;
    setStep('confirm');
  };

  const submit = async () => {
    setSaving(true);
    const result = await window.api.portfolios.addCash(portfolio.id, {
      type,
      amount,
      ...(historical ? { date } : {}),
    });
    setSaving(false);
    if (result.ok) return onRegistered(result.data);
    if (result.error === 'unauthorized') return onSessionExpired();
    setStep('edit');
    if (result.error === 'insufficient_cash') {
      setAvailable(result.details?.available ?? '0.00');
      return;
    }
    if (result.fields) setFields(result.fields);
    setError(result.error);
  };

  const money = formatMoney(amount || '0', language);
  const values = {
    amount: money,
    name: portfolio.name,
    date: date ? formatCalendarDay(date, language) : '',
  };
  const question =
    type === 'deposit'
      ? t(
          historical ? 'portfolios.cash.confirmDepositOn' : 'portfolios.cash.confirmDeposit',
          values,
        )
      : t(
          historical ? 'portfolios.cash.confirmWithdrawalOn' : 'portfolios.cash.confirmWithdrawal',
          values,
        );

  return (
    <section className="cash-form" aria-labelledby={titleId}>
      <h3 id={titleId}>
        {t(type === 'deposit' ? 'portfolios.cash.depositTitle' : 'portfolios.cash.withdrawalTitle')}
      </h3>
      {step === 'edit' ? (
        <form
          onSubmit={review}
          onKeyDown={(event) => event.key === 'Escape' && onCancel()}
          noValidate
        >
          <MoneyField
            label={t('portfolios.cash.amount')}
            value={amount}
            onChange={setAmount}
            autoFocus
            error={fields.amount}
            errorText={
              available !== null
                ? t('portfolios.cash.insufficient', {
                    available: formatMoney(available, language),
                  })
                : undefined
            }
            hint={t('portfolios.cash.amountHint')}
          />
          {historical && (
            <TextField
              label={t('portfolios.cash.date')}
              type="date"
              value={date}
              onChange={setDate}
              autoComplete="off"
              min={firstDay}
              max={lastDay}
              error={fields.date}
              hint={t('portfolios.cash.dateHint', {
                first: formatCalendarDay(firstDay, language),
                last: formatCalendarDay(lastDay, language),
              })}
            />
          )}
          {error && error !== 'validation_error' && (
            <p className="form-error" role="alert">
              {t(`authErrors.${error}`)}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="pill pill-primary">
              {t('portfolios.cash.review')}
            </button>
            <button type="button" className="pill pill-ghost" onClick={onCancel}>
              {t('portfolios.cash.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div
          className="cash-confirm"
          role="alertdialog"
          aria-labelledby={questionId}
          aria-describedby={warningId}
          onKeyDown={(event) => event.key === 'Escape' && setStep('edit')}
        >
          <p id={questionId} className="cash-confirm-question">
            {question}
          </p>
          <p id={warningId} className="field-hint">
            {t('portfolios.cash.immutable')}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="pill pill-primary"
              autoFocus
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving
                ? t('portfolios.cash.saving')
                : t(
                    type === 'deposit'
                      ? 'portfolios.cash.confirmDepositButton'
                      : 'portfolios.cash.confirmWithdrawalButton',
                  )}
            </button>
            <button type="button" className="pill pill-ghost" onClick={() => setStep('edit')}>
              {t('portfolios.cash.back')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
