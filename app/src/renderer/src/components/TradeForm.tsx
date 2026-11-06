import {
  addDays,
  centsToAmount,
  isoDateInBrasilia,
  TRADE_QUANTITY_MAX,
  type Asset,
  type FieldErrorCode,
  type IsoDate,
  type Portfolio,
  type TradeQuote,
  type TradeResult,
  type TradeType,
} from '@simulador/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { formatCalendarDay, formatMoney, quoteMoment } from '../format';
import { AssetLogo } from './AssetLogo';
import { MoneyField } from './MoneyField';
import { TextField } from './TextField';

/** O ativo da negociação: o que a tela mostra dele (com o logo, SPEC-040). */
export type TradeAsset = Pick<Asset, 'id' | 'ticker' | 'name' | 'class' | 'hasLogo'>;

/** A cotação é pedida de novo a cada 5 minutos com o formulário aberto (SPEC-014 §4.2). */
const QUOTE_REFRESH_MS = 5 * 60 * 1000;

/** Valores da API ("1234.56", "-0.05") em centavos, sem ponto flutuante (RNF12). */
function cents(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  return negative ? -result : result;
}

type QuoteState =
  /** SPEC-016: na histórica, enquanto a data não foi escolhida. */
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: TradeQuote }
  | { status: 'failed'; error: ClientAuthError };

/**
 * Comprar ou vender na carteira ao vivo (SPEC-014 §5.2): o ativo (busca na compra), a cotação com o
 * horário, a quantidade com Máximo ou Tudo e "Calcular por valor", o total e o caixa depois, o aviso
 * de custos (RB21) e a confirmação. Se a cotação mudar antes de confirmar, nada é gravado e a
 * confirmação mostra o preço novo.
 */
export function TradeForm({
  portfolio,
  type,
  initialAsset,
  firstDay,
  onDone,
  onCancel,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  type: TradeType;
  initialAsset: TradeAsset | null;
  /** SPEC-016, na histórica: o primeiro dia aceito para a data (início ou último lançamento). */
  firstDay: IsoDate;
  onDone: (result: TradeResult) => void;
  onCancel: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [asset, setAsset] = useState<TradeAsset | null>(initialAsset);

  return (
    <section
      className="trade-form"
      aria-labelledby={titleId}
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
    >
      <h3 id={titleId}>
        {type === 'buy'
          ? t('portfolios.trade.buyTitle')
          : t('portfolios.trade.sellTitle', { ticker: asset?.ticker ?? '' })}
      </h3>
      {asset ? (
        <TradeDetails
          key={asset.id}
          portfolio={portfolio}
          type={type}
          asset={asset}
          firstDay={firstDay}
          onChangeAsset={type === 'buy' && !initialAsset ? () => setAsset(null) : null}
          onDone={onDone}
          onCancel={onCancel}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <AssetPicker onPick={setAsset} onCancel={onCancel} onSessionExpired={onSessionExpired} />
      )}
    </section>
  );
}

/** Busca do ativo para comprar: a mesma busca da lista Ativos, só com os ativos ativos. */
function AssetPicker({
  onPick,
  onCancel,
  onSessionExpired,
}: {
  onPick: (asset: TradeAsset) => void;
  onCancel: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Asset[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = text.trim();
    if (query === '') return undefined;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      void window.api.assets.search({ q: query }).then((result) => {
        if (!active) return;
        setSearching(false);
        if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
        setResults(result.ok ? result.data.assets.slice(0, 8) : []);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text, onSessionExpired]);

  const shown = text.trim() === '' ? null : results;

  return (
    <div className="trade-picker">
      <div className="field">
        <label htmlFor={id}>{t('portfolios.trade.asset')}</label>
        <input
          id={id}
          type="search"
          value={text}
          autoFocus
          autoComplete="off"
          aria-describedby={`${id}-hint`}
          onChange={(event) => setText(event.target.value)}
        />
        <p id={`${id}-hint`} className="field-hint">
          {t('portfolios.trade.assetHint')}
        </p>
      </div>
      <p className="field-hint" role="status">
        {searching ? t('portfolios.trade.searching') : ''}
        {!searching && shown && shown.length === 0 ? t('portfolios.trade.noResults') : ''}
      </p>
      {shown && shown.length > 0 && (
        <ul className="trade-results">
          {shown.map((found) => (
            <li key={found.id}>
              <button
                type="button"
                className="trade-result"
                onClick={() =>
                  onPick({
                    id: found.id,
                    ticker: found.ticker,
                    name: found.name,
                    class: found.class,
                    hasLogo: found.hasLogo,
                  })
                }
              >
                <AssetLogo asset={found} />
                <strong>{found.ticker}</strong>
                <span>{found.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="form-actions">
        <button type="button" className="pill pill-ghost" onClick={onCancel}>
          {t('portfolios.trade.cancel')}
        </button>
      </div>
    </div>
  );
}

function TradeDetails({
  portfolio,
  type,
  asset,
  firstDay,
  onChangeAsset,
  onDone,
  onCancel,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  type: TradeType;
  asset: TradeAsset;
  /** SPEC-016, na histórica: o primeiro dia aceito (início ou último lançamento, RB25). */
  firstDay: IsoDate;
  onChangeAsset: (() => void) | null;
  onDone: (result: TradeResult) => void;
  onCancel: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const quantityId = useId();
  const questionId = useId();
  const warningId = useId();
  const percentId = useId();
  const historical = portfolio.type === 'historical';
  // SPEC-016: na histórica, o dia da negociação; a cotação é o fechamento desse dia.
  const [date, setDate] = useState('');
  const [dateError, setDateError] = useState<FieldErrorCode | undefined>(undefined);
  const quoteKey = historical ? date : 'live';
  const [state, setState] = useState<QuoteState & { key: string }>({
    status: 'loading',
    key: quoteKey,
  });
  const [reload, setReload] = useState(0);
  const [quantityText, setQuantityText] = useState('');
  const [byValue, setByValue] = useState(false);
  const [byValueMode, setByValueMode] = useState<'amount' | 'percent'>('amount');
  const [amount, setAmount] = useState('');
  const [percentText, setPercentText] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<ClientAuthError | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // O último dia aceito na histórica é ontem ou antes: o servidor confere se foi dia de pregão.
  const lastDay = addDays(isoDateInBrasilia(new Date()), -1);

  // Ao vivo: a cotação ao abrir e a cada 5 minutos. Histórica: o fechamento de cada data escolhida.
  // E de novo quando o servidor recusa por causa dela.
  useEffect(() => {
    if (historical && !date) return undefined;
    let active = true;
    const load = () =>
      void window.api.portfolios
        .tradeQuote(portfolio.id, asset.id, historical ? date : undefined)
        .then((result) => {
          if (!active) return;
          if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
          if (!result.ok && result.fields?.date) {
            setDateError(result.fields.date);
            setState({ status: 'failed', error: 'validation_error', key: quoteKey });
            return;
          }
          setDateError(undefined);
          setState(
            result.ok
              ? { status: 'ready', quote: result.data, key: quoteKey }
              : { status: 'failed', error: result.error, key: quoteKey },
          );
        });
    load();
    const timer = historical ? undefined : setInterval(load, QUOTE_REFRESH_MS);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [portfolio.id, asset.id, onSessionExpired, reload, historical, date, quoteKey]);

  // A cotação mostrada é sempre a da data escolhida agora (a de antes não vale enquanto carrega).
  const current: QuoteState =
    historical && !date
      ? { status: 'idle' }
      : state.key === quoteKey
        ? state
        : { status: 'loading' };
  const quote = current.status === 'ready' ? current.quote : null;
  const ready = quote?.tradable ? quote : null;
  const priceCents = ready ? cents(ready.price) : 0n;
  const cashCents = quote ? cents(quote.cash) : 0n;
  const quantity = /^\d{1,7}$/.test(quantityText) ? Number(quantityText) : null;
  const totalCents = quantity !== null ? BigInt(quantity) * priceCents : 0n;
  const cashAfter = type === 'buy' ? cashCents - totalCents : cashCents + totalCents;
  // Máximo: o que o caixa paga, arredondando para baixo, até o teto da RB27.
  const affordable = priceCents > 0n ? cashCents / priceCents : 0n;
  const maxBuy = Number(
    affordable > BigInt(TRADE_QUANTITY_MAX) ? BigInt(TRADE_QUANTITY_MAX) : affordable,
  );
  const money = (value: bigint) => formatMoney(centsToAmount(value), language);
  const blocked = type === 'buy' && quote !== null && !quote.buyable;

  // "Calcular por valor": em reais ou em % do caixa (SPEC-016, o "50% em PETR4" da P01), quantas
  // unidades cabem, arredondando para baixo.
  const percent = /^\d{1,3}$/.test(percentText) ? Number(percentText) : null;
  const percentValid = percent !== null && percent >= 1 && percent <= 100;
  const amountCents =
    byValueMode === 'percent'
      ? percentValid
        ? (cashCents * BigInt(percent)) / 100n
        : 0n
      : amount
        ? cents(amount)
        : 0n;
  const fits = priceCents > 0n ? amountCents / priceCents : 0n;
  const fitsCapped = fits > BigInt(TRADE_QUANTITY_MAX) ? BigInt(TRADE_QUANTITY_MAX) : fits;
  const showFits = byValueMode === 'percent' ? percentValid : amount !== '';

  const review = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setChanged(false);
    if (!ready) return;
    const problem = quantityProblem();
    setQuantityError(problem);
    if (!problem) setStep('confirm');
  };

  /** O que dá para conferir aqui; o servidor confere de novo com a carteira travada. */
  const quantityProblem = (): string | null => {
    if (quantity === null || quantity < 1) return t('fieldErrors.invalid_quantity');
    if (quantity > TRADE_QUANTITY_MAX) return t('portfolios.trade.quantityMax');
    if (type === 'buy' && totalCents > cashCents) {
      return t('portfolios.trade.insufficientCash', { available: money(cashCents) });
    }
    if (type === 'sell' && quote && quantity > quote.held) {
      return t('portfolios.trade.insufficientPosition', { held: quote.held });
    }
    return null;
  };

  const submit = async () => {
    if (!ready || quantity === null) return;
    setSaving(true);
    const result = await window.api.portfolios.trade(portfolio.id, {
      type,
      assetId: asset.id,
      quantity,
      // Ao vivo, a cotação vista; na histórica, a data (o fechamento dela não muda).
      ...(historical ? { date: ready.date } : { quotedAt: ready.quotedAt ?? '' }),
    });
    setSaving(false);
    if (result.ok) return onDone(result.data);
    if (result.error === 'unauthorized') return onSessionExpired();
    const details = result.details ?? {};
    if (result.error === 'quote_changed' && details.price && details.quotedAt) {
      // Nada foi gravado: a confirmação passa a mostrar o preço novo.
      setState({
        status: 'ready',
        quote: { ...ready, price: details.price, quotedAt: details.quotedAt },
        key: quoteKey,
      });
      setChanged(true);
      // O botão ficou desativado enquanto gravava: o foco volta para ele.
      requestAnimationFrame(() => confirmButton.current?.focus());
      return;
    }
    setStep('edit');
    if (result.error === 'insufficient_cash') {
      setQuantityError(
        t('portfolios.trade.insufficientCash', {
          available: formatMoney(details.available ?? '0.00', language),
        }),
      );
      return;
    }
    if (result.error === 'insufficient_position') {
      setQuantityError(t('portfolios.trade.insufficientPosition', { held: details.held ?? '0' }));
      return;
    }
    if (result.fields?.quantity) {
      setQuantityError(quantityMessage(result.fields.quantity));
      return;
    }
    if (result.fields?.date) {
      setDateError(result.fields.date);
      return;
    }
    // Bolsa fechou, cotação sumiu, ativo desativado ou outro lançamento chegou antes: a cotação de
    // agora explica.
    setError(result.error);
    setReload((value) => value + 1);
  };

  const quantityMessage = (code: FieldErrorCode) =>
    code === 'above_max' ? t('portfolios.trade.quantityMax') : t(`fieldErrors.${code}`);

  const time = ready?.quotedAt ? quoteMoment(ready.quotedAt, language).time : '';
  const values = {
    quantity: quantity ?? 0,
    ticker: asset.ticker,
    price: ready ? formatMoney(ready.price, language) : '',
    time,
    date: ready ? formatCalendarDay(ready.date, language) : '',
    total: money(totalCents),
    cash: money(cashAfter),
  };
  const question = historical
    ? t(type === 'buy' ? 'portfolios.trade.confirmBuyOn' : 'portfolios.trade.confirmSellOn', values)
    : t(type === 'buy' ? 'portfolios.trade.confirmBuy' : 'portfolios.trade.confirmSell', values);

  return (
    <div className="trade-details">
      <div className="trade-asset">
        <p>
          <AssetLogo asset={asset} />
          <strong>{asset.ticker}</strong> <span>{asset.name}</span>
        </p>
        {onChangeAsset && step === 'edit' && (
          <button type="button" className="link" onClick={onChangeAsset}>
            {t('portfolios.trade.changeAsset')}
          </button>
        )}
      </div>

      {historical && step === 'edit' && (
        <TextField
          label={t('portfolios.trade.date')}
          type="date"
          value={date}
          onChange={(value) => {
            setDate(value);
            setDateError(undefined);
          }}
          autoComplete="off"
          min={firstDay}
          max={lastDay}
          error={dateError}
          hint={t('portfolios.trade.dateHint', {
            first: formatCalendarDay(firstDay, language),
            last: formatCalendarDay(lastDay, language),
          })}
        />
      )}

      <QuoteLine state={current} ticker={asset.ticker} date={date} />

      {error && error !== 'validation_error' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}

      {ready && !blocked && step === 'edit' && (
        <form onSubmit={review} noValidate>
          <div className="field">
            <label htmlFor={quantityId}>{t('portfolios.trade.quantity')}</label>
            <div className="trade-quantity">
              <input
                id={quantityId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoFocus={!historical}
                value={quantityText}
                aria-invalid={quantityError ? true : undefined}
                aria-describedby={`${quantityId}-hint${quantityError ? ` ${quantityId}-error` : ''}`}
                onChange={(event) =>
                  setQuantityText(event.target.value.replace(/\D/g, '').slice(0, 7))
                }
              />
              <button
                type="button"
                className="pill pill-ghost pill-small"
                onClick={() => setQuantityText(String(type === 'buy' ? maxBuy : ready.held))}
              >
                {type === 'buy' ? t('portfolios.trade.max') : t('portfolios.trade.all')}
              </button>
            </div>
            <p id={`${quantityId}-hint`} className="field-hint">
              {t('portfolios.trade.quantityHint')}{' '}
              {ready.held > 0 && t('portfolios.trade.held', { quantity: ready.held })}
            </p>
            {quantityError && (
              <p id={`${quantityId}-error`} className="field-error">
                {quantityError}
              </p>
            )}
          </div>

          {type === 'buy' && (
            <div className="trade-by-value">
              <button
                type="button"
                className="link"
                aria-expanded={byValue}
                onClick={() => setByValue((open) => !open)}
              >
                {t('portfolios.trade.byValue')}
              </button>
              {byValue && (
                <>
                  <fieldset className="trade-mode">
                    <legend>{t('portfolios.trade.byValueMode')}</legend>
                    {(['amount', 'percent'] as const).map((mode) => (
                      <label key={mode}>
                        <input
                          type="radio"
                          name={`${percentId}-mode`}
                          checked={byValueMode === mode}
                          onChange={() => setByValueMode(mode)}
                        />
                        {mode === 'amount'
                          ? t('portfolios.trade.modeAmount')
                          : t('portfolios.trade.modePercent')}
                      </label>
                    ))}
                  </fieldset>
                  {byValueMode === 'amount' ? (
                    <MoneyField
                      label={t('portfolios.trade.byValueAmount')}
                      value={amount}
                      onChange={setAmount}
                    />
                  ) : (
                    <div className="field">
                      <label htmlFor={percentId}>{t('portfolios.trade.percentLabel')}</label>
                      <div className="money-input percent-input">
                        <input
                          id={percentId}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={percentText}
                          aria-invalid={percentText !== '' && !percentValid ? true : undefined}
                          aria-describedby={`${percentId}-hint`}
                          onChange={(event) =>
                            setPercentText(event.target.value.replace(/\D/g, '').slice(0, 3))
                          }
                        />
                        <span className="percent-suffix" aria-hidden="true">
                          %
                        </span>
                      </div>
                      <p id={`${percentId}-hint`} className="field-hint">
                        {percentText !== '' && !percentValid
                          ? t('portfolios.trade.percentInvalid')
                          : t('portfolios.trade.percentHint', { cash: money(cashCents) })}
                      </p>
                    </div>
                  )}
                  {showFits && (
                    <p className="trade-fits" role="status">
                      {fitsCapped > 0n
                        ? t('portfolios.trade.fits', {
                            quantity: Number(fitsCapped),
                            total: money(fitsCapped * priceCents),
                            rest: money(amountCents - fitsCapped * priceCents),
                          })
                        : t('portfolios.trade.fitsNone')}
                      {fitsCapped > 0n && (
                        <button
                          type="button"
                          className="pill pill-ghost pill-small"
                          onClick={() => setQuantityText(String(fitsCapped))}
                        >
                          {t('portfolios.trade.useQuantity', { quantity: Number(fitsCapped) })}
                        </button>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <dl className="trade-summary">
            <div>
              <dt>{t('portfolios.trade.total')}</dt>
              <dd>{money(totalCents)}</dd>
            </div>
            <div>
              <dt>{t('portfolios.trade.cashAfter')}</dt>
              <dd className={cashAfter < 0n ? 'is-negative' : undefined}>{money(cashAfter)}</dd>
            </div>
          </dl>
          <p className="field-hint trade-costs">{t('portfolios.trade.costs')}</p>

          <div className="form-actions">
            <button type="submit" className="pill pill-primary">
              {t('portfolios.trade.review')}
            </button>
            <button type="button" className="pill pill-ghost" onClick={onCancel}>
              {t('portfolios.trade.cancel')}
            </button>
          </div>
        </form>
      )}

      {ready && step === 'confirm' && (
        <div
          className="cash-confirm"
          role="alertdialog"
          aria-labelledby={questionId}
          aria-describedby={warningId}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setStep('edit');
          }}
        >
          {changed && (
            <p className="trade-changed" role="alert">
              {t('portfolios.trade.quoteChanged', { price: values.price, time })}
            </p>
          )}
          <p id={questionId} className="cash-confirm-question">
            {question}
          </p>
          <p id={warningId} className="field-hint">
            {t('portfolios.trade.immutable')} {t('portfolios.trade.costs')}
          </p>
          <div className="form-actions">
            <button
              ref={confirmButton}
              type="button"
              className="pill pill-primary"
              autoFocus
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving
                ? t('portfolios.trade.saving')
                : t(
                    type === 'buy'
                      ? 'portfolios.trade.confirmBuyButton'
                      : 'portfolios.trade.confirmSellButton',
                  )}
            </button>
            <button type="button" className="pill pill-ghost" onClick={() => setStep('edit')}>
              {t('portfolios.trade.back')}
            </button>
          </div>
        </div>
      )}

      {(!ready || blocked) && (
        <div className="form-actions">
          <button type="button" className="pill pill-ghost" onClick={onCancel}>
            {t('portfolios.trade.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * O preço que a negociação usaria: ao vivo, com o horário e o atraso; na histórica, o fechamento da
 * B3 do dia escolhido. Ou por que não dá.
 */
function QuoteLine({ state, ticker, date }: { state: QuoteState; ticker: string; date: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  if (state.status === 'idle') {
    return <p className="field-hint">{t('portfolios.trade.pickDate')}</p>;
  }
  if (state.status === 'loading') {
    return (
      <p className="loading" role="status">
        {t('portfolios.trade.loadingQuote')}
      </p>
    );
  }
  if (state.status === 'failed') {
    // A data errada já aparece no campo.
    if (state.error === 'validation_error') return null;
    return (
      <p className="form-error" role="alert">
        {t(`authErrors.${state.error}`)}
      </p>
    );
  }
  const { quote } = state;
  if (!quote.tradable) {
    const day = date ? formatCalendarDay(date, language) : '';
    const message =
      quote.reason === 'market_closed'
        ? quote.nextTradingDay
          ? t('portfolios.trade.marketClosed', {
              date: formatCalendarDay(quote.nextTradingDay, language),
            })
          : t('portfolios.trade.marketClosedNoDate')
        : quote.reason === 'no_quote_today'
          ? t('portfolios.trade.noQuoteToday')
          : quote.reason === 'no_close_that_day'
            ? quote.lastTradingDay
              ? t('portfolios.trade.noClose', {
                  ticker,
                  date: day,
                  last: formatCalendarDay(quote.lastTradingDay, language),
                })
              : t('portfolios.trade.noCloseNoPrevious', { ticker, date: day })
            : quote.reason === 'history_pending'
              ? t('portfolios.trade.historyPending')
              : t(`authErrors.${quote.reason}`);
    return (
      <p className="trade-blocked" role="status">
        {message}
      </p>
    );
  }
  return (
    <div className="trade-quote">
      <p className="trade-price">{formatMoney(quote.price, language)}</p>
      <p className="field-hint">
        {quote.source === 'b3' || !quote.quotedAt
          ? t('portfolios.trade.closeOf', { date: formatCalendarDay(quote.date, language) })
          : t('assets.quote.today', {
              time: quoteMoment(quote.quotedAt, language).time,
              delay: quote.delayMinutes,
            })}
      </p>
      {!quote.buyable && <p className="trade-blocked">{t('portfolios.trade.assetInactive')}</p>}
    </div>
  );
}
