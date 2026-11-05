import {
  DIVIDEND_PERIODS,
  INDICATOR_GROUPS,
  INDICATORS,
  type AssetDividends,
  type AssetFundamentals,
  type DividendPeriod,
  type FundInfo,
  type IndicatorCode,
  type IndicatorValue,
} from '@simulador/shared';
import { Info, Question } from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { formatCalendarDay, formatDate, formatDividend, formatIndicator } from '../format';

const UNIT = new Map<string, (typeof INDICATORS)[number]['unit']>(
  INDICATORS.map((indicator) => [indicator.code, indicator.unit]),
);
const GROUP = new Map<string, (typeof INDICATORS)[number]['group']>(
  INDICATORS.map((indicator) => [indicator.code, indicator.group]),
);

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; error: ClientAuthError };

/**
 * Indicadores do Investidor10 (SPEC-041 §5.3), usados com autorização só neste projeto acadêmico:
 * por grupo, com a explicação de cada um, o histórico anual das ações, a fonte e a data da coleta.
 * Com a coleta desligada (fim da autorização), a seção não aparece.
 */
export function FundamentalsPanel({
  assetId,
  ticker,
  onSessionExpired,
}: {
  assetId: string;
  ticker: string;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const [state, setState] = useState<Load<AssetFundamentals>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void window.api.fundamentals.get(assetId).then((result) => {
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
  }, [assetId, onSessionExpired]);

  if (state.status === 'failed' && state.error === 'source_disabled') return null;

  let content;
  if (state.status === 'loading') {
    content = (
      <p className="chart-placeholder" role="status">
        {t('fundamentals.loading')}
      </p>
    );
  } else if (state.status === 'failed') {
    content = (
      <p className="form-error" role="alert">
        {t('fundamentals.failed')}
      </p>
    );
  } else if (state.data.status === 'no_page') {
    content = <p className="assets-empty">{t('fundamentals.noPage')}</p>;
  } else if (state.data.current.length === 0 && !state.data.fund) {
    content = <p className="assets-empty">{t('fundamentals.notCollected')}</p>;
  } else {
    const data = state.data;
    content = (
      <>
        {data.fund && <FundInfoList fund={data.fund} />}
        {INDICATOR_GROUPS.map((group) => {
          const items = data.current.filter((item) => GROUP.get(item.code) === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="indicator-group">
              <h3>{t(`fundamentals.group.${group}`)}</h3>
              <dl className="session-grid">
                {items.map((item) => (
                  <IndicatorItem key={item.code} item={item} />
                ))}
              </dl>
            </div>
          );
        })}
        {data.history.years.length > 0 && (
          <IndicatorHistory ticker={ticker} history={data.history} />
        )}
        {data.collectedAt && (
          <p className="field-hint">
            {t('fundamentals.source', { date: formatDate(data.collectedAt, i18n.language) })}
          </p>
        )}
      </>
    );
  }

  return (
    <section className="profile-panel asset-fundamentals" aria-labelledby={titleId}>
      <div className="asset-panel-head">
        <h2 id={titleId}>{t('fundamentals.title')}</h2>
      </div>
      {content}
      <p className="assets-note chart-notice">
        <Info weight="fill" aria-hidden="true" />
        <span>{t('fundamentals.notice')}</span>
      </p>
    </section>
  );
}

function formatValue(code: IndicatorCode, value: string | null, language: string): string {
  if (value === null) return '—';
  return formatIndicator(value, UNIT.get(code) ?? 'multiple', language);
}

/** Um indicador com o botão de ajuda, como os termos do último pregão (SPEC-010). */
function IndicatorItem({ item }: { item: IndicatorValue }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const helpId = useId();
  const label = t(`fundamentals.indicator.${item.code}.name`);
  return (
    <div className="session-item">
      <dt>
        <span>{label}</span>
        <button
          type="button"
          className="term-help-button"
          aria-label={t('detail.helpLabel', { term: label })}
          aria-expanded={open}
          aria-controls={helpId}
          onClick={() => setOpen((current) => !current)}
        >
          <Question weight="bold" aria-hidden="true" />
        </button>
      </dt>
      <dd>
        <span className="session-value">{formatValue(item.code, item.value, i18n.language)}</span>
        <span id={helpId} className="term-help" hidden={!open}>
          {t(`fundamentals.indicator.${item.code}.help`)}
        </span>
      </dd>
    </div>
  );
}

const FUND_FIELDS: ReadonlyArray<keyof FundInfo> = [
  'fundType',
  'segment',
  'mandate',
  'management',
  'adminFee',
  'term',
  'audience',
];

function FundInfoList({ fund }: { fund: FundInfo }) {
  const { t } = useTranslation();
  const fields = FUND_FIELDS.filter((field) => fund[field]);
  if (fields.length === 0) return null;
  return (
    <dl className="fund-info">
      {fields.map((field) => (
        <div key={field}>
          <dt>{t(`fundamentals.fund.${field}`)}</dt>
          <dd>{fund[field]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Histórico anual das ações: uma linha por indicador, uma coluna por ano, com rolagem própria. */
function IndicatorHistory({
  ticker,
  history,
}: {
  ticker: string;
  history: AssetFundamentals['history'];
}) {
  const { t, i18n } = useTranslation();
  return (
    <details className="indicator-history">
      <summary>{t('fundamentals.history.toggle')}</summary>
      <div
        className="table-scroll"
        tabIndex={0}
        aria-label={t('fundamentals.history.label', { ticker })}
      >
        <table>
          <caption className="visually-hidden">
            {t('fundamentals.history.label', { ticker })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('fundamentals.history.indicator')}</th>
              {history.years.map((year) => (
                <th key={year} scope="col">
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.rows.map((row) => (
              <tr key={row.code}>
                <th scope="row">{t(`fundamentals.indicator.${row.code}.name`)}</th>
                {row.values.map((value, index) => (
                  <td key={history.years[index]}>{formatValue(row.code, value, i18n.language)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Proventos do Investidor10 (SPEC-042 §5.3): total de 12 meses e a lista do período, com tipo, data
 * com, pagamento e valor por ação ou cota. Com a coleta desligada, a seção não aparece.
 */
export function DividendsPanel({
  assetId,
  onSessionExpired,
}: {
  assetId: string;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const [period, setPeriod] = useState<DividendPeriod>('12m');
  // A resposta guarda o período: trocar de período mostra "carregando" até a nova chegar.
  const [loaded, setLoaded] = useState<{ period: DividendPeriod; load: Load<AssetDividends> }>({
    period,
    load: { status: 'loading' },
  });
  const state: Load<AssetDividends> =
    loaded.period === period ? loaded.load : { status: 'loading' };

  useEffect(() => {
    let active = true;
    void window.api.fundamentals.dividends(assetId, period).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setLoaded({
        period,
        load: result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', error: result.error },
      });
    });
    return () => {
      active = false;
    };
  }, [assetId, period, onSessionExpired]);

  if (state.status === 'failed' && state.error === 'source_disabled') return null;

  let content;
  if (state.status === 'loading') {
    content = (
      <p className="chart-placeholder" role="status">
        {t('dividends.loading')}
      </p>
    );
  } else if (state.status === 'failed') {
    content = (
      <p className="form-error" role="alert">
        {t('dividends.failed')}
      </p>
    );
  } else {
    const data = state.data;
    content = (
      <>
        <p className="dividends-total">
          {data.total12m
            ? t('dividends.total12m', { value: formatDividend(data.total12m, language) })
            : t('dividends.noTotal')}
        </p>
        {data.items.length === 0 ? (
          <p className="assets-empty">{t('dividends.none')}</p>
        ) : (
          <div className="table-scroll" tabIndex={0} aria-label={t('dividends.tableLabel')}>
            <table className="dividends-table">
              <caption className="visually-hidden">{t('dividends.tableLabel')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('dividends.kind')}</th>
                  <th scope="col">{t('dividends.exDate')}</th>
                  <th scope="col">{t('dividends.paymentDate')}</th>
                  <th scope="col">{t('dividends.value')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr key={`${item.exDate}-${item.kind}-${index}`}>
                    <td>{t(`dividends.kinds.${item.kind}`)}</td>
                    <td>{formatCalendarDay(item.exDate, language)}</td>
                    <td>
                      {item.paymentDate ? formatCalendarDay(item.paymentDate, language) : '—'}
                    </td>
                    <td>{formatDividend(item.value, language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint">
          {data.collectedAt
            ? t('dividends.source', { date: formatDate(data.collectedAt, language) })
            : t('dividends.sourceOnly')}
        </p>
      </>
    );
  }

  return (
    <section className="profile-panel asset-dividends" aria-labelledby={titleId}>
      <div className="asset-panel-head">
        <h2 id={titleId}>{t('dividends.title')}</h2>
        <div className="period-buttons" role="group" aria-label={t('dividends.periodLabel')}>
          {DIVIDEND_PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              className="period-button"
              aria-pressed={option === period}
              onClick={() => setPeriod(option)}
            >
              {t(`dividends.periods.${option}`)}
            </button>
          ))}
        </div>
      </div>
      {content}
      <p className="assets-note chart-notice">
        <Info weight="fill" aria-hidden="true" />
        <span>{t('dividends.notice')}</span>
      </p>
    </section>
  );
}
