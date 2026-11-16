import type { IsoDate } from '@simulador/shared';
import type { RunError, RunResult } from './ports.js';

/** Erros guardados por execução; o resto vira um resumo (mesmo limite da SPEC-008). */
const MAX_STORED_ERRORS = 100;

/**
 * Registro de uma execução de série diária (o CDI da SPEC-007 e os índices da SPEC-020): pedidos,
 * leituras, falhas, registros gravados e o período coberto.
 */
export class SeriesRunLog {
  readonly errors: RunError[] = [];
  private hiddenErrors = 0;
  records = 0;
  requests = 0;
  read = 0;
  failed = 0;
  waiting = false;
  private periodStart: IsoDate | null = null;
  private periodEnd: IsoDate | null = null;

  error(message: string, date: IsoDate | null = null): void {
    if (this.errors.length < MAX_STORED_ERRORS) this.errors.push({ message, date });
    else this.hiddenErrors += 1;
  }

  saved(rows: ReadonlyArray<{ date: IsoDate }>, changed: number): void {
    this.records += changed;
    for (const { date } of rows) {
      if (this.periodStart === null || date < this.periodStart) this.periodStart = date;
      if (this.periodEnd === null || date > this.periodEnd) this.periodEnd = date;
    }
  }

  result(): RunResult {
    const errors =
      this.hiddenErrors > 0
        ? [...this.errors, { message: `mais ${this.hiddenErrors} erros não guardados` }]
        : this.errors;
    return {
      status:
        this.failed > 0 && this.read === 0
          ? 'falha'
          : errors.length > 0 || this.failed > 0
            ? 'parcial'
            : this.waiting && this.records === 0
              ? 'aguardando_publicacao'
              : 'sucesso',
      records: this.records,
      affectedAssets: 0,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      errors,
      requests: this.requests,
    };
  }
}
