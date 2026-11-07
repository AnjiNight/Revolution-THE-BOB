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
import { ArrowDown, ArrowUp, Info } from '@phosphor-icons/react';
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react';
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
  // SPEC-015: o lançamento com a confirmação de estorno aberta e o botão que a abriu.
  const [reversing, setReversing] = useState<{ entry: CashEntry; opener: HTMLElement } | null>(
    null,
  );
  const noticeRef = useRef<HTMLParagraphElement>(null);

  /** Estornado: o aviso recebe o foco (a linha e o botão mudam), e caixa e posições recarregam. */
  const reversed = () => {
    setReversing(null);
    setNotice(t('portfolios.cash.reversal.done'));
    onChanged();
    requestAnimationFrame(() => noticeRef.current?.focus());
  };
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

  // Histórica (RB25): do início da carteira ou do último lançamento, o que vier depois. Os
  // proventos (SPEC-043) não são lançamentos do usuário e não contam.
  const lastDate = data?.entries.find((entry) => entry.type !== 'income')?.date;
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
        <p ref={noticeRef} className="form-success" role="status" tabIndex={-1}>
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
      {data && data.balance.startsWith('-') && (
        <p className="form-error" role="alert">
          {t('portfolios.cash.income.negative')}
        </p>
      )}
      {data && !data.incomeEnabled && (
        <p className="assets-note">
          <Info weight="fill" aria-hidden="true" />
          <span>{t('portfolios.cash.income.disabled')}</span>
        </p>
      )}
      {data && data.pendingIncome.length > 0 && (
        <div className="cash-pending">
          <h3>{t('portfolios.cash.income.pendingTitle')}</h3>
          <ul>
            {data.pendingIncome.map((income) => (
              <li key={`${income.assetId}${income.kind}${income.exDate}${income.paymentDate}`}>
                {t(
                  income.paymentDate
                    ? 'portfolios.cash.income.pendingOn'
                    : 'portfolios.cash.income.pendingNoDate',
                  {
                    kind: t(`portfolios.cash.income.kinds.${income.kind}`),
                    ticker: income.ticker,
                    amount: formatMoney(income.net, language),
                    date: income.paymentDate ? formatCalendarDay(income.paymentDate, language) : '',
                  },
                )}
              </li>
            ))}
          </ul>
          <p className="field-hint">{t('portfolios.cash.income.source')}</p>
        </div>
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
                <th scope="col">
                  <span className="visually-hidden">{t('portfolios.cash.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <Fragment key={entry.id}>
                  <StatementRow
                    entry={entry}
                    live={portfolio.type === 'live'}
                    onReverse={
                      entry.reversible
                        ? (opener) => {
                            setNotice(null);
                            setReversing({ entry, opener });
                          }
                        : null
                    }
                    // Com uma confirmação aberta, os botões ficam, mas desativados: o foco volta
                    // ao que a abriu quando ela fecha.
                    reverseDisabled={reversing !== null}
                  />
                  {reversing?.entry.id === entry.id && (
                    <tr className="reversal-row">
                      <td colSpan={5}>
                        <ReversalConfirm
                          portfolio={portfolio}
                          entry={entry}
                          onDone={reversed}
                          onCancel={() => {
                            const { opener } = reversing;
                            setReversing(null);
                            requestAnimationFrame(() => opener.focus());
                          }}
                          onSessionExpired={onSessionExpired}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
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

/** A data do lançamento como o extrato mostra: na ao vivo, com a hora do registro em Brasília. */
function entryWhen(entry: CashEntry, live: boolean, language: string): string {
  const day = formatCalendarDay(entry.date, language);
  if (!live) return day;
  const time = new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CALENDAR_TIME_ZONE,
  }).format(new Date(entry.recordedAt));
  return `${day}, ${time}`;
}

/** "o aporte de R$ 5.000,00 de 6 de nov. de 2026, 14:32" (SPEC-015 §4.2). */
function useDescribe() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  return (entry: CashEntry, live: boolean) =>
    t(`portfolios.cash.reversal.description.${entry.type}`, {
      amount: formatMoney(entry.amount, language),
      quantity: entry.trade ? new Intl.NumberFormat(language).format(entry.trade.quantity) : '',
      ticker: entry.trade?.ticker ?? '',
      price: entry.trade ? formatMoney(entry.trade.price, language) : '',
      date: entryWhen(entry, live, language),
    });
}

function StatementRow({
  entry,
  live,
  onReverse,
  reverseDisabled,
}: {
  entry: CashEntry;
  live: boolean;
  /** `null`: este lançamento não pode ser estornado agora (ou outro está sendo). */
  onReverse: ((opener: HTMLElement) => void) | null;
  reverseDisabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const describe = useDescribe();
  // Entra no caixa: aporte, venda e provento; sai: retirada e compra.
  const credit = entry.type === 'deposit' || entry.type === 'sell' || entry.type === 'income';
  const sign = credit ? '+' : '−';
  const money = (value: string) => formatMoney(value, language);
  const typeLabel = entry.income
    ? t(`portfolios.cash.income.kinds.${entry.income.kind}`)
    : entry.fraction
      ? t('portfolios.cash.income.fraction')
      : t(`portfolios.cash.types.${entry.type}`);
  const reversedAt = entry.reversedAt
    ? new Intl.DateTimeFormat(language, {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: CALENDAR_TIME_ZONE,
      }).format(new Date(entry.reversedAt))
    : null;
  return (
    <tr className={reversedAt ? 'is-reversed' : undefined}>
      <td data-label={t('portfolios.cash.columns.date')}>{entryWhen(entry, live, language)}</td>
      <td data-label={t('portfolios.cash.columns.type')}>
        {/* Um bloco só: no cartão (480 px), fica inteiro do lado direito do rótulo. */}
        <span className="cash-type-cell">
          <span className="cash-type">{typeLabel}</span>
          {/* SPEC-043: provento pago e fração vendida, com a fonte (autorização do Investidor10). */}
          {entry.income && (
            <span className="cash-trade">
              {t('portfolios.cash.income.detail', {
                quantity: new Intl.NumberFormat(language).format(entry.income.quantity),
                ticker: entry.income.ticker,
                perShare: new Intl.NumberFormat(language, {
                  style: 'currency',
                  currency: 'BRL',
                  maximumFractionDigits: 8,
                }).format(Number(entry.income.perShare)),
                exDate: formatCalendarDay(entry.income.exDate, language),
              })}
              {entry.income.tax !== '0.00' &&
                ` · ${t('portfolios.cash.income.tax', {
                  gross: money(entry.income.gross),
                  tax: money(entry.income.tax),
                })}`}
              {` · ${t('portfolios.cash.income.source')}`}
            </span>
          )}
          {entry.fraction && (
            <span className="cash-trade">
              {t('portfolios.cash.income.fractionDetail', {
                shares: new Intl.NumberFormat(language, { maximumFractionDigits: 6 }).format(
                  Number(entry.fraction.shares),
                ),
                ticker: entry.fraction.ticker,
                price: money(entry.fraction.price),
              })}
            </span>
          )}
          {entry.trade && (
            <span className="cash-trade">
              {t('portfolios.cash.tradeDetail', {
                quantity: new Intl.NumberFormat(language).format(entry.trade.quantity),
                ticker: entry.trade.ticker,
                price: formatMoney(entry.trade.price, language),
              })}
            </span>
          )}
          {/* Riscado e também escrito: nunca só pela aparência (RNF18). */}
          {reversedAt && (
            <span className="cash-reversed">
              {t('portfolios.cash.reversal.reversed', { date: reversedAt })}
            </span>
          )}
        </span>
      </td>
      <td
        data-label={t('portfolios.cash.columns.amount')}
        className={`cash-number cash-${credit ? 'deposit' : entry.type}`}
      >
        <span className="cash-amount">
          {sign}
          {formatMoney(entry.amount, language)}
        </span>
      </td>
      <td data-label={t('portfolios.cash.columns.balanceAfter')} className="cash-number">
        {entry.balanceAfter === null ? '—' : formatMoney(entry.balanceAfter, language)}
      </td>
      <td data-label="" className="cash-actions-cell">
        {onReverse && (
          <button
            type="button"
            className="pill pill-ghost pill-small"
            disabled={reverseDisabled}
            aria-label={t('portfolios.cash.reversal.reverseLabel', {
              description: describe(entry, live),
            })}
            onClick={(event) => onReverse(event.currentTarget)}
          >
            {t('portfolios.cash.reversal.reverse')}
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Confirmação do estorno (SPEC-015 §4.2), no lugar da linha. A recusa diz qual lançamento
 * estornar antes.
 */
function ReversalConfirm({
  portfolio,
  entry,
  onDone,
  onCancel,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  entry: CashEntry;
  onDone: () => void;
  onCancel: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const describe = useDescribe();
  const questionId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    const result = await window.api.portfolios.reverse(portfolio.id, entry.id);
    setSaving(false);
    if (result.ok) return onDone();
    if (result.error === 'unauthorized') return onSessionExpired();
    setError(refusal(result.error, result.details ?? {}));
    // O botão ficou desativado enquanto esperava: o foco volta para ele (e o Esc continua valendo).
    requestAnimationFrame(() => confirmButton.current?.focus());
  };

  /** A mensagem da recusa; nas que quebram o livro, com o lançamento que quebraria. */
  const refusal = (error: ClientAuthError, details: Readonly<Record<string, string>>) => {
    const type = details.type;
    const date = details.date
      ? new Intl.DateTimeFormat(language, {
          day: '2-digit',
          month: '2-digit',
          timeZone: 'UTC',
        }).format(new Date(`${details.date}T00:00:00Z`))
      : '';
    const values = {
      amount: details.amount ? formatMoney(details.amount, language) : '',
      quantity: details.quantity
        ? new Intl.NumberFormat(language).format(Number(details.quantity))
        : '',
      ticker: details.ticker ?? '',
      date,
    };
    if (error === 'reversal_breaks_cash' && type) {
      return t('portfolios.cash.reversal.breaksCash', {
        at: t(`portfolios.cash.reversal.at.${type}`, values),
        that: t(`portfolios.cash.reversal.that.${type}`),
      });
    }
    if (error === 'reversal_breaks_position' && type) {
      return t('portfolios.cash.reversal.breaksPosition', values);
    }
    return t(`authErrors.${error}`);
  };

  return (
    <div
      className="cash-confirm"
      role="alertdialog"
      aria-labelledby={questionId}
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
    >
      <p id={questionId} className="cash-confirm-question">
        {t('portfolios.cash.reversal.confirm', {
          description: describe(entry, portfolio.type === 'live'),
        })}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          ref={confirmButton}
          type="button"
          className="pill pill-primary"
          autoFocus
          disabled={saving}
          onClick={() => void confirm()}
        >
          {saving
            ? t('portfolios.cash.reversal.saving')
            : t('portfolios.cash.reversal.confirmButton')}
        </button>
        <button type="button" className="pill pill-ghost" onClick={onCancel}>
          {t('portfolios.cash.reversal.cancel')}
        </button>
      </div>
    </div>
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
