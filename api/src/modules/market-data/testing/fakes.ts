import type { NonTradingDay } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import { InMemoryAuditTrail } from '../../audit/testing/fakes.js';
import type {
  CalendarRepository,
  NewCalendarPublication,
  StoredCalendarYear,
} from '../application/ports.js';

/** Calendário em memória para testes sem banco. */
export class InMemoryCalendarRepository implements CalendarRepository {
  readonly years = new Map<number, StoredCalendarYear>();

  constructor(readonly audit: InMemoryAuditTrail = new InMemoryAuditTrail()) {}

  findYear(year: number): Promise<StoredCalendarYear | null> {
    return Promise.resolve(this.copy(this.years.get(year)));
  }

  findYears(from: number, to: number): Promise<StoredCalendarYear[]> {
    const found = [...this.years.values()]
      .filter((stored) => stored.year >= from && stored.year <= to)
      .sort((a, b) => a.year - b.year)
      .map((stored) => this.copy(stored) as StoredCalendarYear);
    return Promise.resolve(found);
  }

  publish(
    publication: NewCalendarPublication,
    audit: (before: NonTradingDay[] | null) => AuditEntry,
  ): Promise<StoredCalendarYear> {
    const before = this.years.get(publication.year)?.nonTradingDays.map((day) => ({ ...day }));
    this.audit.append(audit(before ?? null));
    const stored: StoredCalendarYear = {
      ...publication,
      nonTradingDays: [...publication.nonTradingDays].sort((a, b) => a.date.localeCompare(b.date)),
    };
    this.years.set(publication.year, stored);
    return Promise.resolve(this.copy(stored) as StoredCalendarYear);
  }

  private copy(stored: StoredCalendarYear | undefined): StoredCalendarYear | null {
    return stored
      ? { ...stored, nonTradingDays: stored.nonTradingDays.map((day) => ({ ...day })) }
      : null;
  }
}
