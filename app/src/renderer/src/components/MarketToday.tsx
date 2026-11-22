import {
  MARKET_TODAY_DELAY_MINUTES,
  MARKET_TODAY_SYMBOLS,
  type MarketReading,
  type MarketToday,
  type MarketTodaySymbol,
} from '@simulador/shared';
import { ArrowDown, ArrowRight, ArrowUp, Warning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChange, quoteMoment } from '../format';
import { changeDirection } from './QuoteText';

/** Ibovespa em pontos sem casas ("166.376 pts"); dólar com 4 casas ("R$ 5,9074"). */
export function formatMarketValue(
  symbol: MarketTodaySymbol,
  value: string,
  language: string,
): string {
  if (symbol === 'ibovespa') {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Number(value));
  }
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number(value));
}

const ICONS = { up: ArrowUp, down: ArrowDown, flat: ArrowRight } as const;

/**
 * SPEC-048: o painel "Mercado hoje" no Início do usuário, com o Ibovespa e o dólar pela Yahoo
 * Finance. Sempre o horário e o atraso, nunca "tempo real" (DA16); a variação tem sinal e ícone,
 * não só cor (RNF18). Se a leitura falhar, o painel some e o resto do Início segue.
 */
export function MarketTodayPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<MarketToday | null>(null);

  useEffect(() => {
    let current = true;
    void window.api.indexes.today().then((result) => current && result.ok && setData(result.data));
    return () => {
      current = false;
    };
  }, []);

  if (!data) return null;
  const empty = MARKET_TODAY_SYMBOLS.every((symbol) => data[symbol] === null);
  return (
    <section className="market-today" aria-labelledby="market-today-title">
      <h2 id="market-today-title" className="section-label">
        {t('home.market.title')}
      </h2>
      {empty ? (
        <p className="market-today-empty">{t('home.market.empty')}</p>
      ) : (
        <ul className="market-today-grid">
          {MARKET_TODAY_SYMBOLS.map((symbol) => (
            <li key={symbol} className="market-today-card">
              <MarketCard symbol={symbol} reading={data[symbol]} />
            </li>
          ))}
        </ul>
      )}
      <p className="market-today-source">{t('home.market.source')}</p>
    </section>
  );
}

function MarketCard({
  symbol,
  reading,
}: {
  symbol: MarketTodaySymbol;
  reading: MarketReading | null;
}) {
  const { t, i18n } = useTranslation();
  const name = t(`home.market.names.${symbol}`);
  if (!reading) {
    return (
      <>
        <h3>{name}</h3>
        <p className="quote-none">{t('home.market.none')}</p>
      </>
    );
  }
  const moment = quoteMoment(reading.at, i18n.language);
  const direction = changeDirection(reading.change);
  const Icon = ICONS[direction];
  const value = formatMarketValue(symbol, reading.value, i18n.language);
  return (
    <>
      <h3>{name}</h3>
      <p className="market-today-line">
        <span className="market-today-value">
          {symbol === 'ibovespa' ? t('home.market.points', { value }) : value}
        </span>
        {reading.change !== null && (
          <span className={`quote-change is-${direction}`}>
            <Icon weight="bold" aria-hidden="true" />
            {formatChange(reading.change, i18n.language)}
          </span>
        )}
      </p>
      <p className="quote-time">
        {moment.today
          ? t('home.market.today', { time: moment.time, delay: MARKET_TODAY_DELAY_MINUTES })
          : t('home.market.otherDay', { date: moment.date, time: moment.time })}
      </p>
      {reading.stale && (
        <p className="market-today-stale">
          <Warning weight="bold" aria-hidden="true" />
          {t('home.market.stale', { date: moment.date, time: moment.time })}
        </p>
      )}
    </>
  );
}
