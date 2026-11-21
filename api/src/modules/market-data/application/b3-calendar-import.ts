import { HISTORY_START_YEAR, isoDateInBrasilia, yearOf, type IsoDate } from '@simulador/shared';
import { cotahistSessionDate } from '../domain/cotahist.js';
import {
  B3CalendarFileError,
  calendarDifference,
  nonTradingDaysFromSessions,
} from '../domain/calendar-from-b3.js';
import { RETRY_DELAYS_MS } from './history-ingestion.js';
import type {
  CalendarRepository,
  CotahistSource,
  RunError,
  RunResult,
  StoredCalendarYear,
  TaskRunReader,
  TaskRunRepository,
} from './ports.js';

export interface B3CalendarImportDeps {
  source: CotahistSource;
  calendars: CalendarRepository;
  runs: TaskRunRepository & TaskRunReader;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
}

/**
 * Anos fechados do calendário de pregão a partir do arquivo anual da B3 (SPEC-005 §10): publica os
 * que ainda não foram publicados e confere os que o colaborador publicou, sem mudá-los. O ano
 * atual e os futuros continuam com a equipe. Sem trabalho, não grava execução e devolve `null`.
 */
export class B3CalendarImport {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelays: readonly number[];

  constructor(private readonly deps: B3CalendarImportDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms)));
    this.retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  async run(): Promise<RunResult | null> {
    const lastClosedYear = yearOf(isoDateInBrasilia(this.clock())) - 1;
    if (lastClosedYear < HISTORY_START_YEAR) return null;
    const [published, lastRun] = await Promise.all([
      this.deps.calendars.findYears(HISTORY_START_YEAR, lastClosedYear),
      this.deps.runs.lastRun('calendario_b3'),
    ]);
    const byYear = new Map(published.map((stored) => [stored.year, stored]));
    // Ano do colaborador: conferido uma vez depois de cada publicação dele (§10). Uma execução que
    // falhou não conta como conferência.
    const checkedSince = lastRun && lastRun.status !== 'falha' ? lastRun.startedAt : null;
    const work: Array<{ year: number; stored: StoredCalendarYear | null }> = [];
    for (let year = HISTORY_START_YEAR; year <= lastClosedYear; year += 1) {
      const stored = byYear.get(year) ?? null;
      const toCheck =
        stored?.source === 'collaborator' && (!checkedSince || stored.publishedAt > checkedSince);
      if (!stored || toCheck) work.push({ year, stored });
    }
    if (work.length === 0) return null;

    const startedAt = this.clock();
    const runId = await this.deps.runs.start('calendario_b3', startedAt);
    const errors: RunError[] = [];
    const publishedYears: string[] = [];
    const checkedYears: string[] = [];
    const files = { read: 0, failed: 0, waiting: false };

    try {
      await this.importYears(work, { errors, publishedYears, checkedYears, files });
    } catch (error) {
      files.failed += 1;
      errors.push({ message: `erro inesperado: ${messageOf(error)}` });
    }

    const result: RunResult = {
      status:
        files.failed > 0 && files.read === 0
          ? 'falha'
          : errors.length > 0
            ? 'parcial'
            : files.waiting && files.read === 0
              ? 'aguardando_publicacao'
              : 'sucesso',
      records: publishedYears.length,
      affectedAssets: 0,
      periodStart: publishedYears.length > 0 ? `${publishedYears[0]}-01-01` : null,
      periodEnd: publishedYears.length > 0 ? `${publishedYears.at(-1)}-12-31` : null,
      errors,
      totals: { published: publishedYears, checked: checkedYears },
    };
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }

  private async importYears(
    work: Array<{ year: number; stored: StoredCalendarYear | null }>,
    log: {
      errors: RunError[];
      publishedYears: string[];
      checkedYears: string[];
      files: { read: number; failed: number; waiting: boolean };
    },
  ): Promise<void> {
    const { errors, publishedYears, checkedYears, files } = log;
    for (const { year, stored } of work) {
      let sessions: Set<IsoDate> | null;
      try {
        sessions = await this.withRetries(() => this.readSessions(year));
      } catch (error) {
        files.failed += 1;
        errors.push({ message: `arquivo anual de ${year}: ${messageOf(error)}` });
        continue;
      }
      if (!sessions) {
        files.waiting = true;
        continue;
      }
      files.read += 1;

      let days;
      try {
        days = nonTradingDaysFromSessions(year, sessions);
      } catch (error) {
        if (!(error instanceof B3CalendarFileError)) throw error;
        errors.push({ message: error.message });
        continue;
      }

      if (stored) {
        checkedYears.push(String(year));
        const difference = calendarDifference(stored.nonTradingDays, days);
        const problems = [
          difference.onlyPublished.length > 0 &&
            `sem pregão no calendário publicado e com pregão no arquivo: ${difference.onlyPublished.join(', ')}`,
          difference.onlyInFile.length > 0 &&
            `com pregão no calendário publicado e sem pregão no arquivo: ${difference.onlyInFile.join(', ')}`,
        ].filter((problem): problem is string => typeof problem === 'string');
        if (problems.length > 0) errors.push({ message: `${year}: ${problems.join('; ')}` });
        continue;
      }

      const now = this.clock();
      await this.deps.calendars.publish(
        { year, publishedAt: now, publishedBy: null, source: 'b3_file', nonTradingDays: days },
        (before) => ({
          at: now,
          collaboratorId: null,
          action: 'calendar_imported',
          entity: 'calendar_year',
          entityId: String(year),
          details: {
            before: before?.map(({ date, reason }) => ({ date, reason })) ?? null,
            after: days.map(({ date, reason }) => ({ date, reason })),
          },
        }),
      );
      publishedYears.push(String(year));
    }
  }

  /** Pregões que aparecem no arquivo anual de um ano fechado; `null` se a B3 ainda não publicou. */
  private async readSessions(year: number): Promise<Set<IsoDate> | null> {
    const lines = await this.deps.source.annual(year, true);
    if (!lines) return null;
    const sessions = new Set<IsoDate>();
    for await (const line of lines) {
      const date = cotahistSessionDate(line);
      if (date) sessions.add(date);
    }
    return sessions;
  }

  /** As mesmas novas tentativas da SPEC-008; arquivo não publicado (`null`) não é falha. */
  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        const delay = this.retryDelays[attempt];
        if (delay === undefined) throw error;
        await this.sleep(delay);
      }
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
