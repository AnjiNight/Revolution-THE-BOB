import {
  centsToAmount,
  TRADE_QUANTITY_MAX,
  type Asset,
  type FieldErrorCode,
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
  onDone,
  onCancel,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  type: TradeType;
  initialAsset: TradeAsset | null;
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
  onChangeAsset,
  onDone,
  onCancel,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  type: TradeType;
  asset: TradeAsset;
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
  const [state, setState] = useState<QuoteState>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [quantityText, setQuantityText] = useState('');
  const [byValue, setByValue] = useState(false);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<ClientAuthError | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  // A cotação ao abrir e a cada 5 minutos (e de novo quando o servidor recusa por causa dela).
  useEffect(() => {
    let active = true;
    const load = () =>
      void window.api.portfolios.tradeQuote(portfolio.id, asset.id).then((result) => {
        if (!active) return;
        if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
        setState(
          result.ok
            ? { status: 'ready', quote: result.data }
            : { status: 'failed', error: result.error },
        );
      });
    load();
    const timer = setInterval(load, QUOTE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [portfolio.id, asset.id, onSessionExpired, reload]);

  const quote = state.status === 'ready' ? state.quote : null;
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

  // "Calcular por valor": quantas unidades cabem na quantia, arredondando para baixo.
  const amountCents = amount ? cents(amount) : 0n;
  const fits = priceCents > 0n ? amountCents / priceCents : 0n;
  const fitsCapped = fits > BigInt(TRADE_QUANTITY_MAX) ? BigInt(TRADE_QUANTITY_MAX) : fits;

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
      quotedAt: ready.quotedAt,
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
    // Bolsa fechou, cotação sumiu ou ativo desativado: a cotação de agora explica.
    setError(result.error);
    setReload((current) => current + 1);
  };

  const quantityMessage = (code: FieldErrorCode) =>
    code === 'above_max' ? t('portfolios.trade.quantityMax') : t(`fieldErrors.${code}`);

  const time = ready ? quoteMoment(ready.quotedAt, language).time : '';
  const values = {
    quantity: quantity ?? 0,
    ticker: asset.ticker,
    price: ready ? formatMoney(ready.price, language) : '',
    time,
    total: money(totalCents),
    cash: money(cashAfter),
  };

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

      <QuoteLine state={state} />

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
                autoFocus
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
                  <MoneyField
                    label={t('portfolios.trade.byValueAmount')}
                    value={amount}
                    onChange={setAmount}
                  />
                  {amount && (
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
            {t(
              type === 'buy' ? 'portfolios.trade.confirmBuy' : 'portfolios.trade.confirmSell',
              values,
            )}
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

/** O preço que a negociação usaria, com o horário e o atraso; ou por que não dá agora. */
function QuoteLine({ state }: { state: QuoteState }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  if (state.status === 'loading') {
    return (
      <p className="loading" role="status">
        {t('portfolios.trade.loadingQuote')}
      </p>
    );
  }
  if (state.status === 'failed') {
    return (
      <p className="form-error" role="alert">
        {t(`authErrors.${state.error}`)}
      </p>
    );
  }
  const { quote } = state;
  if (!quote.tradable) {
    const message =
      quote.reason === 'market_closed'
        ? quote.nextTradingDay
          ? t('portfolios.trade.marketClosed', {
              date: formatCalendarDay(quote.nextTradingDay, language),
            })
          : t('portfolios.trade.marketClosedNoDate')
        : quote.reason === 'no_quote_today'
          ? t('portfolios.trade.noQuoteToday')
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
        {t('assets.quote.today', {
          time: quoteMoment(quote.quotedAt, language).time,
          delay: quote.delayMinutes,
        })}
      </p>
      {!quote.buyable && <p className="trade-blocked">{t('portfolios.trade.assetInactive')}</p>}
    </div>
  );
}
