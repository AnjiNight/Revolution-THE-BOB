import type { CashEntry, IsoDate, PerformancePeriod, PerformanceQuery } from '@simulador/shared';

/** O período do relatório: um dos botões da Rentabilidade, ou o personalizado (SPEC-038 §4.1). */
export function reportPeriod(query: PerformanceQuery): PerformancePeriod | 'custom' {
  return 'period' in query ? query.period : 'custom';
}

/**
 * O extrato do relatório (SPEC-038 §4.2): os lançamentos do período que valem, do mais antigo para
 * o mais recente, como um extrato de banco (o servidor manda do mais recente para o mais antigo).
 * Os estornados ficam de fora (não contam no saldo, SPEC-015), e a nota diz quantos são.
 */
export function statementForReport(
  entries: readonly CashEntry[],
  from: IsoDate,
  to: IsoDate,
): { entries: CashEntry[]; reversed: number } {
  const inPeriod = entries.filter((entry) => entry.date >= from && entry.date <= to);
  return {
    entries: inPeriod.filter((entry) => entry.reversedAt === null).reverse(),
    reversed: inPeriod.filter((entry) => entry.reversedAt !== null).length,
  };
}

/**
 * As páginas do extrato vêm do mais recente para o mais antigo: a que já chegou antes do início do
 * período é a última que o relatório precisa (uma histórica longa não lê anos à toa).
 */
export function needsMorePages(
  page: readonly CashEntry[],
  hasMore: boolean,
  from: IsoDate,
): boolean {
  const oldest = page.at(-1);
  return hasMore && oldest !== undefined && oldest.date >= from;
}

function cents(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const total = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  return negative ? -total : total;
}

function decimal(total: bigint): string {
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

/**
 * Os proventos recebidos (o líquido de cada um), somados em centavos exatos: nada de ponto
 * flutuante com dinheiro (RNF12). A venda de fração (SPEC-043) não é provento e fica de fora.
 */
export function incomeReceived(entries: readonly CashEntry[]): string {
  return decimal(
    entries.reduce((sum, entry) => (entry.income ? sum + cents(entry.amount) : sum), 0n),
  );
}

/**
 * De quando são os dados no modo consulta (SPEC-032): a leitura guardada mais antiga. `null` quando
 * tudo veio do servidor agora.
 */
export function oldestSavedAt(reads: ReadonlyArray<{ savedAt?: string }>): string | null {
  return reads.reduce<string | null>(
    (oldest, read) => (read.savedAt && (!oldest || read.savedAt < oldest) ? read.savedAt : oldest),
    null,
  );
}
