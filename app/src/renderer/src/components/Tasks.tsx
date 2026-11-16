import type {
  IngestionTaskCode,
  ProcessorState,
  TaskList,
  TaskOverview,
  TaskRunDetail,
  TaskRunError,
  TaskRunStatus,
} from '@simulador/shared';
import {
  ArrowLeft,
  CheckCircle,
  CircleNotch,
  Hourglass,
  Pulse,
  Warning,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import '../asset-detail.css';
import '../tasks.css';
import { formatCalendarDay, formatCount } from '../format';
import { formatDuration, scheduleText, sinceText, statusTone, whenText } from '../tasks';

/** SPEC-011: a tela se atualiza sozinha enquanto está aberta. */
const REFRESH_MS = 15_000;

/** Os totais que cada tarefa grava e que a tela sabe nomear; os outros não aparecem. */
const KNOWN_TOTALS = [
  'created',
  'deactivated',
  'reactivated',
  'logosSaved',
  'logosMissing',
  'logoErrors',
  'notRecent',
  'outOfFormat',
  'mismatched',
  'b3Behind',
  'published',
  'checked',
  'classificacoes',
  'sugestoes',
  'missing',
  'missingTickers',
  'visited',
  'collected',
  'noPage',
  'layoutErrors',
  'failed',
  'stopped',
] as const;

/** "hoje às 08:00" ou "15/11 às 08:00", no horário de Brasília. */
function useWhen() {
  const { t, i18n } = useTranslation();
  return (iso: string) => whenText(iso, t, i18n.language);
}

/**
 * Tarefas de dados (SPEC-011 §5.3): o estado do processador, as 9 tarefas de ingestão com a
 * última execução e o "Executar agora", e o histórico de cada uma com os erros.
 */
export function Tasks({
  onBack,
  onSessionExpired,
}: {
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; data: TaskList }
    | { status: 'failed'; error: ClientAuthError }
  >({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<IngestionTaskCode | null>(null);
  const [requestErrors, setRequestErrors] = useState<
    Partial<Record<IngestionTaskCode, ClientAuthError>>
  >({});
  /** Os pedidos feitos nesta tela, com a última execução de antes: para anunciar o resultado. */
  const requested = useRef(new Map<IngestionTaskCode, string | null>());
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    void window.api.tasks.list().then((result) => {
      if (!result.ok) {
        if (result.error === 'unauthorized') return onSessionExpired();
        // Uma atualização que falha não apaga o que já está na tela.
        return setState((previous) =>
          previous.status === 'ready' ? previous : { status: 'failed', error: result.error },
        );
      }
      for (const [task, before] of requested.current) {
        const item = result.data.tasks.find((candidate) => candidate.task === task);
        if (!item || item.pendingRequestAt || item.runningSince) continue;
        requested.current.delete(task);
        const name = t(`tasks.names.${task}`);
        setNotice(
          item.lastRun && item.lastRun.id !== before
            ? t('tasks.finished', {
                name,
                // No meio da frase: "Execução terminada: CDI, sucesso, 2 registros."
                status: t(`tasks.status.${item.lastRun.status}`).toLocaleLowerCase(i18n.language),
                count: item.lastRun.records,
                formatted: formatCount(item.lastRun.records, i18n.language),
              })
            : t('tasks.nothing', { name, reason: t(`tasks.nothingReason.${task}`) }),
        );
      }
      setState({ status: 'ready', data: result.data });
    });
  }, [onSessionExpired, t, i18n]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // A lista chegou: o foco vai para o título (só na primeira vez; as atualizações não o movem).
  const ready = state.status === 'ready';
  useEffect(() => {
    if (ready) heading.current?.focus();
  }, [ready]);

  const request = async (item: TaskOverview) => {
    setRequestErrors((previous) => ({ ...previous, [item.task]: undefined }));
    const result = await window.api.tasks.request(item.task);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      setRequestErrors((previous) => ({ ...previous, [item.task]: result.error }));
      return load();
    }
    requested.current.set(item.task, item.lastRun?.id ?? null);
    setNotice(t('tasks.requestSent', { name: t(`tasks.names.${item.task}`) }));
    load();
  };

  return (
    <div className="tasks-page">
      <button type="button" className="link asset-detail-back" onClick={onBack}>
        <ArrowLeft weight="bold" aria-hidden="true" />
        {t('tasks.back')}
      </button>
      <header className="page-hero page-hero-compact">
        <h1 ref={heading} tabIndex={-1}>
          {t('tasks.title')}
        </h1>
        <p className="lead">{t('tasks.subtitle')}</p>
      </header>

      <p className="form-success task-notice" role="status">
        {notice}
      </p>

      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('tasks.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <ProcessorCard processor={state.data.processor} />
          <ul className="task-list">
            {state.data.tasks.map((item) => (
              <TaskCard
                key={item.task}
                item={item}
                processorStopped={state.data.processor.stopped}
                open={open === item.task}
                error={requestErrors[item.task] ?? null}
                onToggle={() => setOpen((current) => (current === item.task ? null : item.task))}
                onRequest={() => void request(item)}
                onSessionExpired={onSessionExpired}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** O processador: ligado (com o último sinal) ou parado desde quando. */
function ProcessorCard({ processor }: { processor: ProcessorState }) {
  const { t, i18n } = useTranslation();
  const when = useWhen();
  const titleId = useId();
  return (
    <section
      className={`task-processor ${processor.stopped ? 'is-stopped' : 'is-running'}`}
      aria-labelledby={titleId}
    >
      <span className="task-processor-icon" aria-hidden="true">
        {processor.stopped ? <Warning weight="bold" /> : <Pulse weight="bold" />}
      </span>
      <div>
        <h2 id={titleId}>{t('tasks.processor.title')}</h2>
        <p>
          {processor.stopped
            ? processor.lastSeenAt
              ? t('tasks.processor.stoppedSince', { when: when(processor.lastSeenAt) })
              : t('tasks.processor.never')
            : t('tasks.processor.running', {
                since: sinceText(processor.lastSeenAt ?? new Date().toISOString(), i18n.language),
              })}
        </p>
        {processor.stopped && <p className="field-hint">{t('tasks.processor.stoppedHint')}</p>}
      </div>
    </section>
  );
}

const STATUS_ICON: Record<TaskRunStatus, typeof CheckCircle> = {
  sucesso: CheckCircle,
  parcial: WarningCircle,
  falha: XCircle,
  aguardando_publicacao: Hourglass,
  cota_esgotada: WarningCircle,
};

/** A situação com ícone e texto, além da cor (RNF18). */
function StatusBadge({ status }: { status: TaskRunStatus | 'running' }) {
  const { t } = useTranslation();
  if (status === 'running') {
    return (
      <span className="task-status tone-running">
        <CircleNotch weight="bold" aria-hidden="true" />
        {t('tasks.status.running')}
      </span>
    );
  }
  const Icon = STATUS_ICON[status];
  return (
    <span className={`task-status tone-${statusTone(status)}`}>
      <Icon weight="fill" aria-hidden="true" />
      {t(`tasks.status.${status}`)}
    </span>
  );
}

function TaskCard({
  item,
  processorStopped,
  open,
  error,
  onToggle,
  onRequest,
  onSessionExpired,
}: {
  item: TaskOverview;
  processorStopped: boolean;
  open: boolean;
  error: ClientAuthError | null;
  onToggle: () => void;
  onRequest: () => void;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const when = useWhen();
  const titleId = useId();
  const reasonId = useId();
  const historyId = useId();
  const name = t(`tasks.names.${item.task}`);
  const sources = new Intl.ListFormat(language, { type: 'conjunction' }).format(
    item.sources.map((source) => t(`tasks.sources.${source}`)),
  );
  const run = item.lastRun;
  const tone = item.runningSince ? 'running' : run ? statusTone(run.status) : 'none';

  // Depois do "Executar agora" o botão fica desativado e perderia o foco: ele vai para a linha
  // "Pedido enviado…" do cartão ou, se o pedido for recusado, para o erro (a página não pula).
  const pendingLine = useRef<HTMLParagraphElement>(null);
  const errorLine = useRef<HTMLParagraphElement>(null);
  const focusAfterRequest = useRef(false);
  useEffect(() => {
    if (!focusAfterRequest.current) return;
    if (item.pendingRequestAt) pendingLine.current?.focus();
    else if (error) errorLine.current?.focus();
    else return;
    focusAfterRequest.current = false;
  }, [item.pendingRequestAt, error]);

  return (
    <li className={`task-card tone-${tone}`} aria-labelledby={titleId}>
      <div className="task-head">
        <h2 id={titleId}>{name}</h2>
        <p className="task-meta">
          {t('tasks.source', { sources, count: item.sources.length })} ·{' '}
          {scheduleText(item.schedule, t, language)}
        </p>
      </div>
      <p className="task-state">
        {item.runningSince ? (
          <>
            <StatusBadge status="running" />
            <span>{t('tasks.runningSince', { when: when(item.runningSince) })}</span>
          </>
        ) : run ? (
          <>
            <StatusBadge status={run.status} />
            <span>
              {[
                when(run.startedAt),
                formatDuration(Date.parse(run.finishedAt) - Date.parse(run.startedAt)),
                t('tasks.records', {
                  count: run.records,
                  formatted: formatCount(run.records, language),
                }),
                t('tasks.assets', {
                  count: run.affectedAssets,
                  formatted: formatCount(run.affectedAssets, language),
                }),
                t('tasks.errors', {
                  count: run.errorCount,
                  formatted: formatCount(run.errorCount, language),
                }),
              ].join(' · ')}
            </span>
          </>
        ) : (
          <span className="field-hint">{t('tasks.neverRan')}</span>
        )}
      </p>
      {item.pendingRequestAt && (
        <p ref={pendingLine} className="task-pending" tabIndex={-1}>
          {t('tasks.pending', { when: when(item.pendingRequestAt) })}
          {processorStopped && ` ${t('tasks.pendingStopped')}`}
        </p>
      )}
      {error && (
        <p ref={errorLine} className="form-error" role="alert" tabIndex={-1}>
          {t(`authErrors.${error}`)}
        </p>
      )}
      <div className="task-actions">
        <button
          type="button"
          className="pill pill-primary pill-small"
          disabled={item.blockedReason !== null}
          aria-describedby={item.blockedReason ? reasonId : undefined}
          onClick={() => {
            focusAfterRequest.current = true;
            onRequest();
          }}
        >
          {t('tasks.runNow')}
        </button>
        <button
          type="button"
          className="pill pill-ghost pill-small"
          aria-expanded={open}
          aria-controls={historyId}
          onClick={onToggle}
        >
          {open ? t('tasks.hideHistory') : t('tasks.showHistory')}
        </button>
        {item.blockedReason && (
          <span id={reasonId} className="field-hint">
            {t(`tasks.blocked.${item.blockedReason}`)}
          </span>
        )}
      </div>
      {open && (
        <TaskHistory
          // Uma execução nova recarrega o histórico.
          key={`${item.lastRun?.id ?? 'nenhuma'}-${item.runningSince ?? ''}`}
          id={historyId}
          task={item.task}
          name={name}
          onSessionExpired={onSessionExpired}
        />
      )}
    </li>
  );
}

/** O histórico de uma tarefa, 50 execuções por vez, com os erros de cada uma. */
function TaskHistory({
  id,
  task,
  name,
  onSessionExpired,
}: {
  id: string;
  task: IngestionTaskCode;
  name: string;
  onSessionExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; runs: TaskRunDetail[]; total: number; hasMore: boolean }
    | { status: 'failed'; error: ClientAuthError }
  >({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorsOf, setErrorsOf] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.api.tasks.runs(task, 0).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok ? { status: 'ready', ...result.data } : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [task, onSessionExpired]);

  const showMore = async () => {
    if (state.status !== 'ready') return;
    setLoadingMore(true);
    const result = await window.api.tasks.runs(task, state.runs.length);
    setLoadingMore(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setState({ status: 'failed', error: result.error });
    }
    setState({ status: 'ready', ...result.data, runs: [...state.runs, ...result.data.runs] });
  };

  return (
    <div id={id} className="task-history">
      <h3>{t('tasks.historyTitle', { name })}</h3>
      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('tasks.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {state.status === 'ready' && state.runs.length === 0 && (
        <p className="field-hint">{t('tasks.neverRan')}</p>
      )}
      {state.status === 'ready' && state.runs.length > 0 && (
        <>
          <table className="task-runs">
            <thead>
              <tr>
                <th scope="col">{t('tasks.columns.started')}</th>
                <th scope="col">{t('tasks.columns.status')}</th>
                <th scope="col">{t('tasks.columns.numbers')}</th>
                <th scope="col">{t('tasks.columns.details')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('tasks.columns.errors')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.runs.map((run) => (
                <Fragment key={run.id}>
                  <RunRow
                    run={run}
                    errorsOpen={errorsOf === run.id}
                    onToggleErrors={() =>
                      setErrorsOf((current) => (current === run.id ? null : run.id))
                    }
                  />
                  {errorsOf === run.id && (
                    <tr className="task-errors-row">
                      <td colSpan={5}>
                        <RunErrors runId={run.id} onSessionExpired={onSessionExpired} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="field-hint">
            {t('tasks.historyCount', {
              count: state.total,
              shown: formatCount(state.runs.length, i18n.language),
              total: formatCount(state.total, i18n.language),
            })}
          </p>
          {state.hasMore && (
            <button
              type="button"
              className="pill pill-ghost pill-small"
              disabled={loadingMore}
              onClick={() => void showMore()}
            >
              {t('tasks.showMore')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RunRow({
  run,
  errorsOpen,
  onToggleErrors,
}: {
  run: TaskRunDetail;
  errorsOpen: boolean;
  onToggleErrors: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const when = useWhen();
  const details: string[] = [];
  if (run.periodStart && run.periodEnd) {
    details.push(
      run.periodStart === run.periodEnd
        ? t('tasks.periodDay', { day: formatCalendarDay(run.periodStart, language) })
        : t('tasks.period', {
            from: formatCalendarDay(run.periodStart, language),
            to: formatCalendarDay(run.periodEnd, language),
          }),
    );
  }
  if (run.requests > 0 || run.quota) {
    details.push(
      run.quota
        ? t('tasks.quota', {
            requests: formatCount(run.requests, language),
            remaining: formatCount(run.quota.remaining, language),
            limit: formatCount(run.quota.limit, language),
          })
        : t('tasks.requests', { formatted: formatCount(run.requests, language) }),
    );
  }
  for (const key of KNOWN_TOTALS) {
    const value = run.totals?.[key];
    if (value === undefined) continue;
    const shown =
      typeof value === 'boolean'
        ? t(value ? 'tasks.yes' : 'tasks.no')
        : Array.isArray(value)
          ? value.length > 0
            ? value.slice(0, 10).join(', ') + (value.length > 10 ? '…' : '')
            : '—'
          : formatCount(value, language);
    details.push(`${t(`tasks.totals.${key}`)}: ${shown}`);
  }
  if (run.request) {
    details.push(
      run.request.name
        ? t('tasks.requestedBy', { name: run.request.name })
        : t('tasks.requestedByRemoved'),
    );
  }

  return (
    <tr>
      <td data-label={t('tasks.columns.started')}>
        {when(run.startedAt)}
        {run.finishedAt && (
          <span className="field-hint">
            {' '}
            · {formatDuration(Date.parse(run.finishedAt) - Date.parse(run.startedAt))}
          </span>
        )}
      </td>
      <td data-label={t('tasks.columns.status')}>
        <StatusBadge status={run.status ?? 'running'} />
      </td>
      <td data-label={t('tasks.columns.numbers')}>
        {[
          t('tasks.records', { count: run.records, formatted: formatCount(run.records, language) }),
          t('tasks.assets', {
            count: run.affectedAssets,
            formatted: formatCount(run.affectedAssets, language),
          }),
        ].join(' · ')}
      </td>
      <td data-label={t('tasks.columns.details')}>{details.join(' · ') || '—'}</td>
      <td className="task-run-actions">
        {run.errorCount > 0 && (
          <button
            type="button"
            className="pill pill-ghost pill-small"
            aria-expanded={errorsOpen}
            onClick={onToggleErrors}
          >
            {errorsOpen
              ? t('tasks.hideErrors')
              : t('tasks.showErrors', {
                  count: run.errorCount,
                  formatted: formatCount(run.errorCount, language),
                })}
          </button>
        )}
      </td>
    </tr>
  );
}

/** Os erros de uma execução, 100 por vez, como o processador gravou (em português). */
function RunErrors({ runId, onSessionExpired }: { runId: string; onSessionExpired: () => void }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; errors: TaskRunError[]; total: number; hasMore: boolean }
    | { status: 'failed'; error: ClientAuthError }
  >({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    void window.api.tasks.errors(runId, 0).then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok ? { status: 'ready', ...result.data } : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [runId, onSessionExpired]);

  const showMore = async () => {
    if (state.status !== 'ready') return;
    setLoadingMore(true);
    const result = await window.api.tasks.errors(runId, state.errors.length);
    setLoadingMore(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setState({ status: 'failed', error: result.error });
    }
    setState({ status: 'ready', ...result.data, errors: [...state.errors, ...result.data.errors] });
  };

  if (state.status === 'loading') {
    return (
      <p className="loading" role="status">
        {t('tasks.loading')}
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
  return (
    <div className="task-errors">
      <ul>
        {state.errors.map((error, index) => (
          <li key={index}>
            <span className="task-error-where">
              {[error.ticker, error.date ? formatCalendarDay(error.date, i18n.language) : null]
                .filter(Boolean)
                .join(' · ') || '—'}
            </span>
            {/* Como o processador gravou: técnico e em português (§4.2). */}
            <span lang="pt-BR">{error.message}</span>
          </li>
        ))}
      </ul>
      <p className="field-hint">
        {t('tasks.errorsCount', {
          count: state.total,
          shown: formatCount(state.errors.length, i18n.language),
          total: formatCount(state.total, i18n.language),
        })}
      </p>
      {state.hasMore && (
        <button
          type="button"
          className="pill pill-ghost pill-small"
          disabled={loadingMore}
          onClick={() => void showMore()}
        >
          {t('tasks.showMore')}
        </button>
      )}
    </div>
  );
}
