import {
  FREE_QUOTE_DELAY_MINUTES,
  type AssetQuote,
  type QuoteCollectionStatus,
} from '@simulador/shared';
import { Info, Warning } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { formatChange, formatMoney, quoteMoment } from '../format';

/**
 * Último preço, variação do dia e horário da cotação (SPEC-009 §5.3), sempre com o atraso e nunca
 * como "tempo real" (DA16). A variação traz o sinal: não depende só da cor (RNF18).
 */
export function QuoteText({ quote }: { quote: AssetQuote | null }) {
  const { t, i18n } = useTranslation();
  if (!quote) return <span className="quote-none">{t('assets.quote.none')}</span>;

  const moment = quoteMoment(quote.at, i18n.language);
  const direction =
    quote.change === null || Number(quote.change) === 0
      ? 'flat'
      : Number(quote.change) > 0
        ? 'up'
        : 'down';
  return (
    <span className="quote">
      <span className="quote-line">
        <span className="quote-price">{formatMoney(quote.price, i18n.language)}</span>
        {quote.change !== null && (
          <span className={`quote-change is-${direction}`}>
            {formatChange(quote.change, i18n.language)}
          </span>
        )}
      </span>
      <span className="quote-time">
        {moment.today
          ? t('assets.quote.today', { time: moment.time, delay: FREE_QUOTE_DELAY_MINUTES })
          : t('assets.quote.otherDay', { date: moment.date, time: moment.time })}
      </span>
    </span>
  );
}

/**
 * Situação da coleta do pregão na tela do colaborador: última coleta, intervalo e avisos. A lista
 * da brapi não gasta a cota (SPEC-040); se um dia gastar, a linha mostra o uso do ciclo.
 */
export function QuoteCollectionLine({ status }: { status: QuoteCollectionStatus }) {
  const { t, i18n } = useTranslation();
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const when = (iso: string) => {
    const moment = quoteMoment(iso, i18n.language);
    return moment.today
      ? t('catalog.quotes.whenToday', { time: moment.time })
      : t('catalog.quotes.whenOther', { date: moment.date, time: moment.time });
  };
  const failed = status.lastStatus === 'parcial' || status.lastStatus === 'falha';

  return (
    <div className="quote-collection">
      <p className="quote-collection-line">
        <Info weight="fill" aria-hidden="true" />
        <span>
          {status.lastRunAt
            ? t('catalog.quotes.lastRun', { when: when(status.lastRunAt) })
            : t('catalog.quotes.never')}
          {' · '}
          {status.quotaCounted
            ? t('catalog.quotes.usage', {
                interval: status.intervalMinutes,
                used: number(status.requestsUsed),
                quota: number(status.quota),
              })
            : t('catalog.quotes.free', { interval: status.intervalMinutes })}
        </span>
      </p>
      {status.quotaExhausted && (
        <p className="catalog-capacity">
          <Warning weight="fill" aria-hidden="true" />
          {status.quotaResetsAt
            ? t('catalog.quotes.exhausted', { when: when(status.quotaResetsAt) })
            : t('catalog.quotes.exhaustedUnknown')}
        </p>
      )}
      {!status.quotaExhausted && status.intervalMinutes > 30 && (
        <p className="catalog-capacity">
          <Warning weight="fill" aria-hidden="true" />
          {t('catalog.quotes.slower', { interval: status.intervalMinutes })}
        </p>
      )}
      {failed && !status.quotaExhausted && (
        <p className="catalog-capacity">
          <Warning weight="fill" aria-hidden="true" />
          {t('catalog.quotes.lastFailed')}
        </p>
      )}
    </div>
  );
}
