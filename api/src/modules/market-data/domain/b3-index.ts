import { CDI_START_DATE, isIsoDate, isWeekend, type IsoDate } from '@simulador/shared';

/**
 * Estatísticas históricas de um índice da B3 (SPEC-020 §4.4). Puro: recebe a resposta de um ano e
 * devolve os fechamentos, sem saber de rede nem de banco.
 */

/** Fechamento do índice num pregão, em pontos com 2 casas, em texto (RNF12): "168498.45". */
export interface IndexClose {
  date: IsoDate;
  value: string;
}

/** Os índices começam no mesmo dia do histórico de cotações e do CDI (04/01/2016). */
export const INDEX_START_DATE: IsoDate = CDI_START_DATE;

/** Como a B3 mostra: milhar com ponto, 2 casas com vírgula ("168.498,45", "999,99"). */
const VALUE_PATTERN = /^(\d{1,3}(?:\.\d{3})*),(\d{2})$/;

/**
 * Lê a resposta de `GetPortfolioDay` de um ano: `results` tem uma linha por dia do mês (`day`, de 1
 * a 31) e `rateValue1` a `rateValue12` (um por mês), com `null` nos dias sem pregão. Valor fora do
 * formato ou dia que não existe (31/02) vira problema, sem derrubar o resto.
 */
export function parseIndexYear(
  code: string,
  year: number,
  body: unknown,
): { closes: IndexClose[]; problems: string[] } {
  const closes: IndexClose[] = [];
  const problems: string[] = [];
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (!Array.isArray(record.results)) {
    return { closes, problems: [`${code} de ${year}: resposta da B3 sem "results"`] };
  }
  for (const row of record.results as unknown[]) {
    const raw = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {};
    const day = typeof raw.day === 'number' ? raw.day : Number.NaN;
    for (let month = 1; month <= 12; month += 1) {
      const text = raw[`rateValue${month}`];
      if (text === null || text === undefined || text === '') continue;
      const date = `${year}-${pad(month)}-${pad(day)}`;
      const match = typeof text === 'string' ? VALUE_PATTERN.exec(text.trim()) : null;
      if (!Number.isInteger(day) || !isIsoDate(date)) {
        problems.push(`${code}: dia ${String(raw.day)}/${month}/${year} não existe`);
      } else if (!match) {
        problems.push(`${code} de ${date} fora do formato: "${String(text)}"`);
      } else {
        const value = `${(match[1] ?? '').replace(/\./g, '')}.${match[2] ?? ''}`;
        if (/^0+\.00$/.test(value)) problems.push(`${code} de ${date} igual a zero`);
        else closes.push({ date, value: value.replace(/^0+(?=\d)/, '') });
      }
    }
  }
  return { closes: closes.sort((a, b) => a.date.localeCompare(b.date)), problems };
}

/** Data que a série recusa (§4.2): fim de semana, futuro ou antes da janela. */
export function indexDateProblem(code: string, date: IsoDate, today: IsoDate): string | null {
  if (isWeekend(date)) return `${code} em ${date}, fim de semana`;
  if (date > today) return `${code} em ${date}, data futura`;
  if (date < INDEX_START_DATE) return `${code} em ${date}, antes de ${INDEX_START_DATE}`;
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
