import {
  FREE_QUOTE_DELAY_MINUTES,
  type Portfolio,
  type PortfolioPositions as PositionsData,
  type Position,
  type TradeResult,
  type TradeType,
} from '@simulador/shared';
import { Info, Plus } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { formatCalendarDay, formatChange, formatMoney, quoteMoment } from '../format';
import { changeDirection } from './QuoteText';
import { TradeForm, type TradeAsset } from './TradeForm';

type PositionsState =
  | { status: 'loading' }
  | { status: 'ready'; data: PositionsData }
  | { status: 'failed'; error: ClientAuthError };

type OpenForm = { type: TradeType; asset: TradeAsset | null; opener: HTMLElement | null };

/**
 * Posições da carteira ao vivo (SPEC-014 §5.2): quantidade, preço médio, último preço, valor atual
 * e variação sobre o preço médio de cada ativo; os totais de caixa, ativos e patrimônio; Comprar e,
 * em cada posição, Vender.
 */
export function PortfolioPositions({
  portfolio,
  version,
  startBuying,
  onChanged,
  onOpenAsset,
  onSessionExpired,
}: {
  portfolio: Portfolio;
  /** Muda a cada lançamento novo (compra, venda, aporte ou retirada): recarrega as posições. */
  version: number;
  /** A ficha do ativo pediu para comprar: o formulário abre já com ele. */
  startBuying: TradeAsset | null;
  onChanged: () => void;
  onOpenAsset: (assetId: string) => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const [state, setState] = useState<PositionsState>({ status: 'loading' });
  const [form, setForm] = useState<OpenForm | null>(
    startBuying ? { type: 'buy', asset: startBuying, opener: null } : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const buyButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void window.api.portfolios.positions(portfolio.id).then((result) => {
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

  /** Fecha o formulário e devolve o foco a quem o abriu (ou ao Comprar). */
  const close = (opener: HTMLElement | null) => {
    setForm(null);
    requestAnimationFrame(() => {
      const target = opener?.isConnected ? opener : buyButton.current;
      target?.focus();
    });
  };

  const done = (result: TradeResult) => {
    setNotice(
      t(result.trade.type === 'buy' ? 'portfolios.positions.bought' : 'portfolios.positions.sold', {
        quantity: result.trade.quantity,
        ticker: result.trade.ticker,
      }),
    );
    // Venda que zera a posição tira a linha (e o botão Vender): o foco vai para Comprar.
    close(result.position === null ? null : (form?.opener ?? null));
    onChanged();
  };

  const open = (type: TradeType, asset: TradeAsset | null, opener: HTMLElement) => {
    setNotice(null);
    setForm({ type, asset, opener });
  };

  const data = state.status === 'ready' ? state.data : null;

  return (
    <section className="profile-panel positions-panel" aria-labelledby={titleId}>
      <div className="cash-head">
        <h2 id={titleId}>{t('portfolios.positions.title')}</h2>
        {!form && (
          <button
            ref={buyButton}
            type="button"
            className="pill pill-primary"
            onClick={(event) => open('buy', null, event.currentTarget)}
          >
            {t('portfolios.positions.buy')}
            <span className="pill-icon" aria-hidden="true">
              <Plus weight="bold" />
            </span>
          </button>
        )}
      </div>

      {data && (
        <dl className="positions-totals">
          <div>
            <dt>{t('portfolios.positions.totals.cash')}</dt>
            <dd>{formatMoney(data.cash, language)}</dd>
          </div>
          <div>
            <dt>{t('portfolios.positions.totals.positions')}</dt>
            <dd>{formatMoney(data.positionsValue, language)}</dd>
          </div>
          <div>
            <dt>{t('portfolios.positions.totals.total')}</dt>
            <dd>{formatMoney(data.total, language)}</dd>
          </div>
        </dl>
      )}

      {form && (
        <TradeForm
          portfolio={portfolio}
          type={form.type}
          initialAsset={form.asset}
          onDone={done}
          onCancel={() => close(form.opener)}
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
          {t('portfolios.positions.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {data && data.positions.length === 0 && (
        <p className="assets-empty">{t('portfolios.positions.empty')}</p>
      )}

      {data && data.positions.length > 0 && (
        <div className="positions-scroll">
          <table className="cash-statement positions-table" aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">{t('portfolios.positions.columns.asset')}</th>
                <th scope="col" className="cash-number">
                  {t('portfolios.positions.columns.quantity')}
                </th>
                <th scope="col" className="cash-number">
                  {t('portfolios.positions.columns.averagePrice')}
                </th>
                <th scope="col" className="cash-number">
                  {t('portfolios.positions.columns.lastPrice')}
                </th>
                <th scope="col" className="cash-number">
                  {t('portfolios.positions.columns.marketValue')}
                </th>
                <th scope="col" className="cash-number">
                  {t('portfolios.positions.columns.change')}
                </th>
                <th scope="col">
                  <span className="visually-hidden">
                    {t('portfolios.positions.columns.actions')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((position) => (
                <PositionRow
                  key={position.assetId}
                  position={position}
                  onOpenAsset={() => onOpenAsset(position.assetId)}
                  onSell={(opener) =>
                    open(
                      'sell',
                      {
                        id: position.assetId,
                        ticker: position.ticker,
                        name: position.name,
                        class: position.class,
                        hasLogo: false,
                      },
                      opener,
                    )
                  }
                  sellDisabled={form !== null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.positions.length > 0 && (
        <p className="field-hint">
          {t('portfolios.positions.priceNote', { delay: FREE_QUOTE_DELAY_MINUTES })}{' '}
          {t('portfolios.positions.changeNote')}
        </p>
      )}
      <p className="assets-note">
        <Info weight="fill" aria-hidden="true" />
        <span>{t('portfolios.positions.dividendsNote')}</span>
      </p>
    </section>
  );
}

function PositionRow({
  position,
  onOpenAsset,
  onSell,
  sellDisabled,
}: {
  position: Position;
  onOpenAsset: () => void;
  onSell: (opener: HTMLElement) => void;
  sellDisabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const columns = 'portfolios.positions.columns';
  const when =
    position.lastPriceKind === 'intraday' && position.lastPriceAt
      ? (() => {
          const moment = quoteMoment(position.lastPriceAt, language);
          // Curto na tabela; o atraso vai na nota abaixo dela.
          return moment.today
            ? t('portfolios.positions.at', { time: moment.time })
            : t('assets.quote.otherDay', { date: moment.date, time: moment.time });
        })()
      : position.lastPriceKind === 'close' && position.lastPriceDate
        ? t('portfolios.positions.closeOf', {
            date: formatCalendarDay(position.lastPriceDate, language),
          })
        : null;
  const direction = changeDirection(position.changePercent);
  const sign =
    position.change && !position.change.startsWith('-') && position.change !== '0.00' ? '+' : '';

  return (
    <tr>
      <td data-label={t(`${columns}.asset`)}>
        <button type="button" className="link position-ticker" onClick={onOpenAsset}>
          {position.ticker}
        </button>
        <span className="position-name">{position.name}</span>
      </td>
      <td data-label={t(`${columns}.quantity`)} className="cash-number">
        {new Intl.NumberFormat(language).format(position.quantity)}
      </td>
      <td data-label={t(`${columns}.averagePrice`)} className="cash-number">
        {formatMoney(position.averagePrice, language)}
      </td>
      <td data-label={t(`${columns}.lastPrice`)} className="cash-number">
        {position.lastPrice ? (
          <span className="position-price">
            {formatMoney(position.lastPrice, language)}
            {when && <span className="position-when">{when}</span>}
          </span>
        ) : (
          t('portfolios.positions.noPrice')
        )}
      </td>
      <td data-label={t(`${columns}.marketValue`)} className="cash-number">
        {position.marketValue ? formatMoney(position.marketValue, language) : '—'}
      </td>
      <td data-label={t(`${columns}.change`)} className="cash-number">
        {position.change && position.changePercent ? (
          <span className={`quote-change is-${direction}`}>
            {sign}
            {formatMoney(position.change, language)} (
            {formatChange(position.changePercent, language)})
          </span>
        ) : (
          '—'
        )}
      </td>
      <td data-label="" className="position-actions">
        <button
          type="button"
          className="pill pill-ghost pill-small"
          disabled={sellDisabled}
          aria-label={t('portfolios.positions.sellLabel', { ticker: position.ticker })}
          onClick={(event) => onSell(event.currentTarget)}
        >
          {t('portfolios.positions.sell')}
        </button>
      </td>
    </tr>
  );
}
