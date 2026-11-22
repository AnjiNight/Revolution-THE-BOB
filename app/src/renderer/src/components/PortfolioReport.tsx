import {
  FREE_QUOTE_DELAY_MINUTES,
  hasPremium,
  isoDateInBrasilia,
  type BenchmarkCode,
  type CashEntry,
  type IncomeDetail,
  type PerformancePoint,
  type PerformanceQuery,
  type Portfolio,
  type PortfolioPerformance,
  type PortfolioPositions,
  type Position,
} from '@simulador/shared';
import { FilePdf } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError, ReportSaveRequest } from '../../../shared/auth-ipc';
import '../asset-detail.css';
import '../portfolios.css';
import '../report.css';
import {
  formatAxisPrice,
  formatCalendarDay,
  formatChange,
  formatDate,
  formatMoney,
  formatTickDate,
  quoteMoment,
} from '../format';
import { chartLayout, spaceTicks, timeTicks } from '../price-chart';
import {
  incomeReceived,
  needsMorePages,
  oldestSavedAt,
  reportPeriod,
  statementForReport,
} from '../report';
import { formatShare } from './PortfolioAllocation';
import { entryWhen } from './PortfolioCash';
import { Benchmarks, formatAxisPercent, pathOf, signed } from './PortfolioPerformance';
import { changeDirection } from './QuoteText';
import { PremiumLock } from './PremiumLock';
import { useOpenPlan } from '../plan';

/** Largura útil de uma página A4 com as margens do PDF (pixels de tela, a 96 por polegada). */
const CHART_WIDTH = 680;
const CHART_HEIGHT = 220;
const MIN_TICK_GAP = 64;

/** Tudo o que o relatório mostra, lido antes de montar o documento. */
interface ReportData {
  portfolio: Portfolio;
  query: PerformanceQuery;
  performance: PortfolioPerformance;
  positions: PortfolioPositions;
  /** O extrato do período, do mais antigo para o mais recente, sem os estornados. */
  entries: CashEntry[];
  reversed: number;
  pendingIncome: IncomeDetail[];
  incomeEnabled: boolean;
  generatedAt: string;
  /** Modo consulta (SPEC-032): de quando são os dados guardados; `null` quando vieram agora. */
  savedAt: string | null;
}

type Missing = 'performance' | 'positions' | 'statement';
type Loaded =
  { ok: true; data: ReportData } | { ok: false; error: ClientAuthError; missing: Missing };

/**
 * Lê o que o relatório precisa com as mesmas leituras da tela: a rentabilidade do período, as
 * posições (com a distribuição) e o extrato, página por página, até o início do período.
 */
async function loadReport(portfolio: Portfolio, query: PerformanceQuery): Promise<Loaded> {
  const [performance, positions] = await Promise.all([
    window.api.portfolios.performance(portfolio.id, query),
    window.api.portfolios.positions(portfolio.id),
  ]);
  if (!performance.ok) return { ok: false, error: performance.error, missing: 'performance' };
  if (!positions.ok) return { ok: false, error: positions.error, missing: 'positions' };

  const reads: Array<{ savedAt?: string }> = [performance, positions];
  const all: CashEntry[] = [];
  let pendingIncome: IncomeDetail[] = [];
  let incomeEnabled = true;
  let offset = 0;
  let more = true;
  while (more) {
    const page = await window.api.portfolios.cash(portfolio.id, offset);
    if (!page.ok) return { ok: false, error: page.error, missing: 'statement' };
    reads.push(page);
    if (offset === 0) {
      pendingIncome = page.data.pendingIncome;
      incomeEnabled = page.data.incomeEnabled;
    }
    all.push(...page.data.entries);
    more = needsMorePages(page.data.entries, page.data.hasMore, performance.data.from);
    offset += page.data.entries.length;
  }

  const statement = statementForReport(all, performance.data.from, performance.data.to);
  return {
    ok: true,
    data: {
      portfolio,
      query,
      performance: performance.data,
      positions: positions.data,
      entries: statement.entries,
      reversed: statement.reversed,
      pendingIncome,
      incomeEnabled,
      generatedAt: new Date().toISOString(),
      savedAt: oldestSavedAt(reads),
    },
  };
}

/** "Desde o início", ou "Personalizado (02/01/2026 a 30/06/2026)". */
function usePeriodText() {
  const { t, i18n } = useTranslation();
  return (query: PerformanceQuery) => {
    const label = t(`portfolios.performance.periods.${reportPeriod(query)}`);
    return 'from' in query
      ? t('report.customPeriod', {
          label,
          from: formatCalendarDay(query.from, i18n.language),
          to: formatCalendarDay(query.to, i18n.language),
        })
      : label;
  };
}

/**
 * Um quadro de pintura antes de imprimir. Com a janela escondida ou minimizada não há quadros: no
 * máximo 100 ms (o documento já está na página, e a impressão monta o próprio layout).
 */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });

type ReportStatus =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'saved'; file: string; folder: string; openFailed: boolean }
  | { kind: 'failed'; message: string };

/** O relatório montado na página, esperando a impressão, com os textos já no idioma de agora. */
interface PendingReport {
  data: ReportData;
  request: ReportSaveRequest;
  title: string;
  failed: string;
}

/**
 * "Baixar relatório (PDF)" (SPEC-038 §5.1): lê o que falta, monta o documento (só para a
 * impressão) e pede ao processo principal o PDF e o "Salvar como". Depois, "Relatório salvo" com
 * Abrir; cancelado, nada muda.
 */
export function ReportButton({
  premium = null,
  portfolio,
  query,
  version,
  onSessionExpired,
}: {
  /** SPEC-025: o relatório é do plano Assinante; `false` mostra o cadeado. */
  premium?: boolean | null;
  portfolio: Portfolio;
  /** O período escolhido na Rentabilidade. */
  query: PerformanceQuery;
  /** Muda a cada lançamento novo: confere de novo se a carteira tem lançamentos. */
  version: number;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const periodText = usePeriodText();
  const openPlan = useOpenPlan();
  const [hasEntries, setHasEntries] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ReportStatus>({ kind: 'idle' });
  const [pending, setPending] = useState<PendingReport | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  /** Depois de um resultado, o foco vai para a mensagem (ou de volta ao botão, se cancelou). */
  const moveFocus = useRef(false);

  useEffect(() => {
    let active = true;
    void window.api.portfolios.cash(portfolio.id, 0).then((result) => {
      // Sem a leitura (sem conexão, por exemplo), o botão fica ativo e o clique explica.
      if (active) setHasEntries(result.ok ? result.data.total > 0 : null);
    });
    return () => {
      active = false;
    };
  }, [portfolio.id, version]);

  // O documento está na página: o processo principal imprime a janela e grava o arquivo.
  useEffect(() => {
    if (!pending) return;
    let active = true;
    const previousTitle = document.title;
    // O título da página vira o título do PDF.
    document.title = pending.title;
    void (async () => {
      await document.fonts.ready;
      await nextFrame();
      await nextFrame();
      const result = await window.api.report.save(pending.request);
      document.title = previousTitle;
      if (!active) return;
      moveFocus.current = true;
      setPending(null);
      if (!result.ok) return setStatus({ kind: 'failed', message: pending.failed });
      setStatus(
        result.data.saved
          ? {
              kind: 'saved',
              file: result.data.file,
              folder: result.data.folder,
              openFailed: false,
            }
          : { kind: 'idle' },
      );
    })();
    return () => {
      active = false;
      document.title = previousTitle;
    };
  }, [pending]);

  useEffect(() => {
    if (!moveFocus.current || status.kind === 'generating') return;
    moveFocus.current = false;
    if (status.kind === 'idle') button.current?.focus();
    else message.current?.focus();
  }, [status]);

  const generate = async () => {
    setStatus({ kind: 'generating' });
    // SPEC-025: o PDF é montado aqui, com dados que o gratuito já vê; por isso o app confere a
    // assinatura antes de gerar (o único bloqueio feito no app).
    const subscription = await window.api.subscription.mine();
    if (subscription.ok && !hasPremium(subscription.data)) {
      setStatus({ kind: 'idle' });
      return openPlan('portfolio_report');
    }
    const loaded = await loadReport(portfolio, query);
    if (!loaded.ok) {
      if (loaded.error === 'unauthorized') return onSessionExpired();
      moveFocus.current = true;
      return setStatus({
        kind: 'failed',
        message:
          loaded.error === 'not_saved_offline'
            ? t('report.needsConnection', { missing: t(`report.missing.${loaded.missing}`) })
            : t(`authErrors.${loaded.error}`),
      });
    }
    setPending({
      data: loaded.data,
      title: t('report.documentTitle', { name: portfolio.name }),
      failed: t('report.failed'),
      request: {
        portfolioName: portfolio.name,
        footerNotice: t('report.footer.notice'),
        footerPage: t('report.footer.page', { page: '{page}', pages: '{pages}' }),
      },
    });
  };

  const open = async (file: string, folder: string) => {
    if (!(await window.api.report.open())) {
      setStatus({ kind: 'saved', file, folder, openFailed: true });
    }
  };

  if (premium === false) {
    return (
      <div className="report-action">
        <PremiumLock feature="portfolio_report">{t('report.button')}</PremiumLock>
      </div>
    );
  }

  return (
    <div className="report-action">
      <button
        ref={button}
        type="button"
        className="pill pill-ghost"
        disabled={hasEntries === false || status.kind === 'generating'}
        aria-describedby={hintId}
        onClick={() => void generate()}
      >
        {t('report.button')}
        <span className="pill-icon" aria-hidden="true">
          <FilePdf weight="bold" />
        </span>
      </button>
      <span id={hintId} className="field-hint">
        {hasEntries === false
          ? t('report.noEntries')
          : t('report.hint', { period: periodText(query) })}
      </span>
      {status.kind === 'generating' && (
        <p className="loading report-status" role="status">
          {t('report.generating')}
        </p>
      )}
      {status.kind === 'saved' && (
        <p ref={message} tabIndex={-1} className="form-success report-status" role="status">
          <span>
            {status.openFailed
              ? t('report.openFailed', { folder: status.folder })
              : t('report.saved', { folder: status.folder })}
          </span>
          {!status.openFailed && (
            <button
              type="button"
              className="pill pill-ghost pill-small"
              aria-label={t('report.openLabel', { file: status.file })}
              onClick={() => void open(status.file, status.folder)}
            >
              {t('report.open')}
            </button>
          )}
        </p>
      )}
      {status.kind === 'failed' && (
        <p ref={message} tabIndex={-1} className="form-error report-status" role="alert">
          {status.message}
        </p>
      )}
      {pending && createPortal(<PortfolioReport data={pending.data} />, document.body)}
    </div>
  );
}

/**
 * O documento do relatório (SPEC-038 §4.2): a fotografia da tela da carteira, em A4 e no tema
 * claro. Fica fora da tela (`display: none`) e só aparece na impressão, que vira o PDF.
 */
function PortfolioReport({ data }: { data: ReportData }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { portfolio, performance, positions } = data;
  const allocation = positions.allocation;
  const money = (value: string) => formatMoney(value, language);
  const day = (value: string) => formatCalendarDay(value, language);
  const points = performance.series;
  const first = points.at(0);
  const last = points.at(-1);
  const codes = performance.benchmarks.map((benchmark) => benchmark.code);
  const live = portfolio.type === 'live';
  const origin = portfolio.copiedFrom
    ? portfolio.copiedFrom.name === null
      ? t('portfolios.copy.fromDeleted', { date: day(portfolio.createdAt.slice(0, 10)) })
      : `${t('portfolios.copy.from', { date: day(portfolio.createdAt.slice(0, 10)) })} ${t(
          'portfolios.copy.fromName',
          { name: portfolio.copiedFrom.name },
        )}`
    : null;

  return (
    <article className="report" lang={language}>
      <header className="report-header">
        <p className="report-kicker">{t('report.title')}</p>
        <h1>{portfolio.name}</h1>
        <p className="report-meta">
          {t(`portfolios.label.${portfolio.type}`)} ·{' '}
          {t('portfolios.since', { date: day(portfolio.startDate) })}
          {origin && ` · ${origin}`}
        </p>
        <dl className="report-facts">
          <div>
            <dt>{t('report.periodLabel')}</dt>
            <dd>
              {t('report.period', {
                from: day(performance.from),
                to: day(performance.to),
                label: t(`portfolios.performance.periods.${reportPeriod(data.query)}`),
              })}
            </dd>
          </div>
          <div>
            <dt>{t('report.generatedLabel')}</dt>
            <dd>{formatDate(data.generatedAt, language, true)}</dd>
          </div>
          {data.savedAt && (
            <div>
              <dt>{t('report.dataLabel')}</dt>
              <dd>{t('report.dataFrom', { date: formatDate(data.savedAt, language, true) })}</dd>
            </div>
          )}
        </dl>
      </header>

      <section className="report-section">
        <h2>{t('report.summary')}</h2>
        {performance.empty ? (
          <p>{t('portfolios.performance.empty')}</p>
        ) : (
          <>
            <dl className="report-totals">
              <div>
                <dt>{t('portfolios.performance.equity')}</dt>
                <dd>{money(performance.endValue)}</dd>
              </div>
              <div>
                <dt>{t('portfolios.performance.result')}</dt>
                <dd className={`quote-change is-${changeDirection(performance.result)}`}>
                  {signed(performance.result)}
                  {money(performance.result)}
                </dd>
              </div>
              <div>
                <dt>{t('portfolios.performance.return')}</dt>
                <dd className={`quote-change is-${changeDirection(performance.return)}`}>
                  {formatChange(performance.return, language)}
                </dd>
              </div>
            </dl>
            <p className="report-note">
              {t('portfolios.performance.flows', {
                start: money(performance.startValue),
                flows: money(performance.netFlows),
              })}
            </p>
            <Benchmarks data={performance} />
            {performance.warnings.map((warning) => (
              <p
                key={`${warning.kind}${warning.assetId}${warning.kind === 'unexplained_jump' ? warning.date : warning.until}`}
                className="report-warning"
              >
                {warning.kind === 'unexplained_jump'
                  ? t('portfolios.performance.jump', {
                      ticker: warning.ticker,
                      date: day(warning.date),
                    })
                  : t('portfolios.performance.noClose', {
                      ticker: warning.ticker,
                      date: day(warning.until),
                    })}
              </p>
            ))}
          </>
        )}
      </section>

      {!performance.empty && first && last && points.length > 1 && (
        <section className="report-section">
          <h2>{t('report.evolution')}</h2>
          <figure className="report-figure">
            <ReportEquityChart
              points={points}
              label={t('report.equityDescription', {
                start: money(first.equity),
                from: day(first.date),
                end: money(last.equity),
                to: day(last.date),
                invested: money(last.invested),
              })}
            />
            <figcaption className="performance-legend">
              <span className="legend-equity">{t('portfolios.performance.legendEquity')}</span>
              <span className="legend-invested">{t('portfolios.performance.legendInvested')}</span>
            </figcaption>
          </figure>
          <figure className="report-figure">
            <ReportReturnChart
              points={points}
              codes={codes}
              label={t('report.returnDescription', {
                values: [
                  `${t('portfolios.performance.legendPortfolio')} ${formatChange(performance.return, language)}`,
                  ...performance.benchmarks.flatMap((benchmark) =>
                    benchmark.return === null
                      ? []
                      : [
                          `${t(`portfolios.performance.benchmarks.${benchmark.code}`)} ${formatChange(benchmark.return, language)}`,
                        ],
                  ),
                ].join(', '),
              })}
            />
            <figcaption className="performance-legend">
              <span className="legend-equity">{t('portfolios.performance.legendPortfolio')}</span>
              {codes.map((code) => (
                <span key={code} className={`legend-${code}`}>
                  {t(`portfolios.performance.benchmarks.${code}`)}
                </span>
              ))}
            </figcaption>
          </figure>
          <p className="report-note">
            {performance.weekly && `${t('portfolios.performance.weekly')} `}
            {t('portfolios.performance.note')}
          </p>
        </section>
      )}

      <section className="report-section">
        <h2>{t('portfolios.positions.title')}</h2>
        <p className="report-note">
          {t('report.positionsDate', { date: day(isoDateInBrasilia(new Date(data.generatedAt))) })}
        </p>
        {positions.positions.length === 0 ? (
          <p>{t('report.noPositions')}</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">{t('portfolios.positions.columns.asset')}</th>
                <th scope="col" className="report-number">
                  {t('portfolios.positions.columns.quantity')}
                </th>
                <th scope="col" className="report-number">
                  {t('portfolios.positions.columns.averagePrice')}
                </th>
                <th scope="col" className="report-number">
                  {t('portfolios.positions.columns.lastPrice')}
                </th>
                <th scope="col" className="report-number">
                  {t('portfolios.positions.columns.marketValue')}
                </th>
                <th scope="col" className="report-number">
                  {t('portfolios.positions.columns.change')}
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.positions.map((position) => (
                <ReportPositionRow
                  key={position.assetId}
                  position={position}
                  incomeEnabled={positions.incomeEnabled}
                />
              ))}
            </tbody>
          </table>
        )}
        <dl className="report-totals">
          <div>
            <dt>{t('portfolios.positions.totals.cash')}</dt>
            <dd>{money(positions.cash)}</dd>
          </div>
          <div>
            <dt>{t('portfolios.positions.totals.positions')}</dt>
            <dd>{money(positions.positionsValue)}</dd>
          </div>
          <div>
            <dt>{t('portfolios.positions.totals.total')}</dt>
            <dd>{money(positions.total)}</dd>
          </div>
        </dl>
        <p className="report-note">
          {t('portfolios.positions.priceNote', { delay: FREE_QUOTE_DELAY_MINUTES })}{' '}
          {t('portfolios.positions.changeNote')}
        </p>
      </section>

      {allocation.classes.length > 0 && (
        <section className="report-section">
          <h2>{t('portfolios.allocation.title')}</h2>
          <ul className="report-classes">
            {allocation.classes.map((item) => (
              <li key={item.kind}>
                <strong>{t(`portfolios.allocation.classes.${item.kind}`)}</strong>
                <span>{formatShare(item.percent, language)}</span>
                <span className="report-muted">{money(item.value)}</span>
              </li>
            ))}
          </ul>
          {allocation.negativeCash && (
            <p className="report-warning">
              {t('portfolios.allocation.negativeCash', { amount: money(allocation.negativeCash) })}
            </p>
          )}
          {allocation.atCost.length > 0 && (
            <p className="report-warning">
              {t('portfolios.allocation.atCost', {
                tickers: new Intl.ListFormat(language, { type: 'conjunction' }).format(
                  allocation.atCost,
                ),
                count: allocation.atCost.length,
              })}
            </p>
          )}
          {allocation.classes.flatMap((item) => {
            if (!item.sectors) return [];
            const assetClass = item.kind === 'fii' ? 'fii' : 'stock';
            return [
              <div key={item.kind} className="report-sectors">
                <h3>{t(`portfolios.allocation.byClass.${assetClass}`)}</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">{t(`report.allocation.${assetClass}`)}</th>
                      <th scope="col" className="report-number">
                        {t('report.allocation.ofClass')}
                      </th>
                      <th scope="col" className="report-number">
                        {t('report.allocation.ofTotal')}
                      </th>
                      <th scope="col" className="report-number">
                        {t('report.allocation.value')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.sectors.map((sector) => (
                      <tr key={sector.sector}>
                        <th scope="row">{t(`assets.sectors.${assetClass}.${sector.sector}`)}</th>
                        <td className="report-number">
                          {formatShare(sector.percentOfClass, language)}
                        </td>
                        <td className="report-number">{formatShare(sector.percent, language)}</td>
                        <td className="report-number">{money(sector.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
            ];
          })}
          <p className="report-note">{t('portfolios.allocation.note')}</p>
        </section>
      )}

      <section className="report-section">
        <h2>{t('report.income.title')}</h2>
        {data.incomeEnabled ? (
          <>
            <dl className="report-totals">
              <div>
                <dt>{t('report.income.received')}</dt>
                <dd>{money(incomeReceived(data.entries))}</dd>
              </div>
              <div>
                <dt>{t('report.income.pending')}</dt>
                <dd>
                  {money(positions.pendingIncome)}
                  {positions.nextPayment && (
                    <span className="report-detail">
                      {t('portfolios.positions.nextPayment', {
                        amount: money(positions.nextPayment.amount),
                        date: day(positions.nextPayment.date),
                      })}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            {data.pendingIncome.length > 0 && (
              <ul className="report-list">
                {data.pendingIncome.map((income) => (
                  <li key={`${income.assetId}${income.kind}${income.exDate}${income.paymentDate}`}>
                    {t(
                      income.paymentDate
                        ? 'portfolios.cash.income.pendingOn'
                        : 'portfolios.cash.income.pendingNoDate',
                      {
                        kind: t(`portfolios.cash.income.kinds.${income.kind}`),
                        ticker: income.ticker,
                        amount: money(income.net),
                        date: income.paymentDate ? day(income.paymentDate) : '',
                      },
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="report-note">{t('portfolios.cash.income.source')}</p>
          </>
        ) : (
          <p>{t('portfolios.cash.income.disabled')}</p>
        )}
      </section>

      <section className="report-section">
        <h2>{t('report.statement.title')}</h2>
        <p className="report-note">{t('report.statement.order')}</p>
        {data.entries.length === 0 ? (
          <p>{t('report.statement.empty')}</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">{t('portfolios.cash.columns.date')}</th>
                <th scope="col">{t('portfolios.cash.columns.type')}</th>
                <th scope="col" className="report-number">
                  {t('portfolios.cash.columns.amount')}
                </th>
                <th scope="col" className="report-number">
                  {t('portfolios.cash.columns.balanceAfter')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <ReportEntryRow key={entry.id} entry={entry} live={live} />
              ))}
            </tbody>
          </table>
        )}
        {data.reversed > 0 && (
          <p className="report-note">{t('report.statement.reversed', { count: data.reversed })}</p>
        )}
      </section>

      <section className="report-section report-notices">
        <h2>{t('report.notices.title')}</h2>
        <ul className="report-list">
          <li>{t('disclaimer')}</li>
          <li>{t('portfolios.trade.costs')}</li>
          <li>{t('report.notices.sources')}</li>
        </ul>
      </section>
    </article>
  );
}

function ReportPositionRow({
  position,
  incomeEnabled,
}: {
  position: Position;
  incomeEnabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const money = (value: string) => formatMoney(value, language);
  const when =
    position.lastPriceKind === 'intraday' && position.lastPriceAt
      ? (() => {
          const moment = quoteMoment(position.lastPriceAt, language);
          return moment.today
            ? t('portfolios.positions.at', { time: moment.time })
            : t('assets.quote.otherDay', { date: moment.date, time: moment.time });
        })()
      : position.lastPriceKind === 'close' && position.lastPriceDate
        ? t('portfolios.positions.closeOf', {
            date: formatCalendarDay(position.lastPriceDate, language),
          })
        : null;
  return (
    <tr>
      <th scope="row">
        <span className="report-strong">{position.ticker}</span>
        <span className="report-detail">{position.name}</span>
        {position.events.map((event) => (
          <span key={event.kind + event.exDate} className="report-detail">
            {t('portfolios.positions.eventApplied', {
              event: t(`portfolios.positions.event.${event.kind}`),
              date: formatCalendarDay(event.exDate, language),
              before: new Intl.NumberFormat(language).format(event.quantityBefore),
              after: new Intl.NumberFormat(language).format(event.quantityAfter),
            })}
          </span>
        ))}
        {position.income !== '0.00' && (
          <span className="report-detail">
            {t('portfolios.positions.incomeReceived', { amount: money(position.income) })}
          </span>
        )}
        {incomeEnabled && !position.incomeLoaded && (
          <span className="report-detail">{t('portfolios.positions.incomeNotLoaded')}</span>
        )}
      </th>
      <td className="report-number">{new Intl.NumberFormat(language).format(position.quantity)}</td>
      <td className="report-number">{money(position.averagePrice)}</td>
      <td className="report-number">
        {position.lastPrice ? money(position.lastPrice) : t('portfolios.positions.noPrice')}
        {position.lastPrice && when && <span className="report-detail">{when}</span>}
      </td>
      <td className="report-number">{position.marketValue ? money(position.marketValue) : '—'}</td>
      <td className="report-number">
        {position.change && position.changePercent ? (
          <span className={`quote-change is-${changeDirection(position.changePercent)}`}>
            {signed(position.change)}
            {money(position.change)} ({formatChange(position.changePercent, language)})
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

function ReportEntryRow({ entry, live }: { entry: CashEntry; live: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const money = (value: string) => formatMoney(value, language);
  // Entra no caixa: aporte, venda e provento; sai: retirada e compra (como no extrato da tela).
  const credit = entry.type === 'deposit' || entry.type === 'sell' || entry.type === 'income';
  const type = entry.income
    ? t(`portfolios.cash.income.kinds.${entry.income.kind}`)
    : entry.fraction
      ? t('portfolios.cash.income.fraction')
      : t(`portfolios.cash.types.${entry.type}`);
  const detail = entry.income
    ? t('portfolios.cash.income.detail', {
        quantity: new Intl.NumberFormat(language).format(entry.income.quantity),
        ticker: entry.income.ticker,
        perShare: new Intl.NumberFormat(language, {
          style: 'currency',
          currency: 'BRL',
          maximumFractionDigits: 8,
        }).format(Number(entry.income.perShare)),
        exDate: formatCalendarDay(entry.income.exDate, language),
      }) +
      (entry.income.tax !== '0.00'
        ? ` · ${t('portfolios.cash.income.tax', {
            gross: money(entry.income.gross),
            tax: money(entry.income.tax),
          })}`
        : '')
    : entry.fraction
      ? t('portfolios.cash.income.fractionDetail', {
          shares: new Intl.NumberFormat(language, { maximumFractionDigits: 6 }).format(
            Number(entry.fraction.shares),
          ),
          ticker: entry.fraction.ticker,
          price: money(entry.fraction.price),
        })
      : entry.trade
        ? t('portfolios.cash.tradeDetail', {
            quantity: new Intl.NumberFormat(language).format(entry.trade.quantity),
            ticker: entry.trade.ticker,
            price: money(entry.trade.price),
          })
        : null;
  return (
    <tr>
      <td>{entryWhen(entry, live, language)}</td>
      <td>
        <span className="report-strong">{type}</span>
        {detail && <span className="report-detail">{detail}</span>}
      </td>
      <td className="report-number">
        {credit ? '+' : '−'}
        {money(entry.amount)}
      </td>
      <td className="report-number">
        {entry.balanceAfter === null ? '—' : money(entry.balanceAfter)}
      </td>
    </tr>
  );
}

/** O eixo das datas, embaixo, como nos gráficos da tela. */
function DateTicks({
  points,
  x,
  left,
}: {
  points: PerformancePoint[];
  x: (index: number) => number;
  left: number;
}) {
  const { i18n } = useTranslation();
  const ticks = spaceTicks(timeTicks(points.map((point) => point.date)), x, MIN_TICK_GAP);
  return (
    <>
      {ticks.map((tick) => (
        <text
          key={tick.index}
          className="chart-axis"
          x={x(tick.index)}
          y={CHART_HEIGHT - 6}
          textAnchor={x(tick.index) - left < 24 ? 'start' : 'middle'}
        >
          {formatTickDate(tick.date, tick.unit, i18n.language)}
        </text>
      ))}
    </>
  );
}

/** Patrimônio (linha cheia, com área) e total aportado (tracejada), como o gráfico em reais. */
function ReportEquityChart({ points, label }: { points: PerformancePoint[]; label: string }) {
  const { i18n } = useTranslation();
  const invested = points.map((point) => Number(point.invested));
  const layout = chartLayout(
    points.map((point) => ({ date: point.date, close: point.equity })),
    CHART_WIDTH,
    CHART_HEIGHT,
    invested,
  );
  const { box, axis, x, y } = layout;
  const investedLine = invested
    .map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`)
    .join('');
  return (
    <svg
      className="report-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={label}
    >
      {axis.ticks.map((value) => (
        <g key={value}>
          <line className="chart-grid" x1={box.left} x2={box.right} y1={y(value)} y2={y(value)} />
          <text className="chart-axis" x={box.right + 8} y={y(value)} dominantBaseline="middle">
            {formatAxisPrice(value, axis.step, i18n.language)}
          </text>
        </g>
      ))}
      <DateTicks points={points} x={x} left={box.left} />
      <path className="chart-area" d={layout.area} />
      <path className="chart-invested" d={investedLine} />
      <path className="chart-line" d={layout.line} />
    </svg>
  );
}

/** A rentabilidade da carteira e das referências, em %, desde o dia-base (o gráfico em %). */
function ReportReturnChart({
  points,
  codes,
  label,
}: {
  points: PerformancePoint[];
  codes: BenchmarkCode[];
  label: string;
}) {
  const { i18n } = useTranslation();
  const extra = codes.flatMap((code) =>
    points.flatMap((point) => {
      const value = point.benchmarks[code];
      return value === null ? [] : [Number(value)];
    }),
  );
  const layout = chartLayout(
    points.map((point) => ({ date: point.date, close: point.return })),
    CHART_WIDTH,
    CHART_HEIGHT,
    [0, ...extra],
  );
  const { box, axis, x, y } = layout;
  return (
    <svg
      className="report-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={label}
    >
      {axis.ticks.map((tick) => (
        <g key={tick}>
          <line className="chart-grid" x1={box.left} x2={box.right} y1={y(tick)} y2={y(tick)} />
          <text className="chart-axis" x={box.right + 8} y={y(tick)} dominantBaseline="middle">
            {formatAxisPercent(tick, axis.step, i18n.language)}
          </text>
        </g>
      ))}
      <line className="chart-zero" x1={box.left} x2={box.right} y1={y(0)} y2={y(0)} />
      <DateTicks points={points} x={x} left={box.left} />
      {codes.map((code) => (
        <path
          key={code}
          className={`chart-benchmark is-${code}`}
          d={pathOf(
            points.map((item) => item.benchmarks[code]),
            x,
            y,
          )}
        />
      ))}
      <path className="chart-line" d={layout.line} />
    </svg>
  );
}
