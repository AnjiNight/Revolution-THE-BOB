import { isIsoDate, type IsoDate } from '@simulador/shared';

/**
 * Eventos corporativos da página da empresa no site da B3 (SPEC-042 §4.3): desdobramentos,
 * grupamentos e bonificações das ações. Puro: recebe o JSON, não sabe de rede.
 */

export type CorporateEventKind = 'desdobramento' | 'grupamento' | 'bonificacao';

export interface CorporateEvent {
  kind: CorporateEventKind;
  /** Último dia com direito (data com): o preço muda no pregão seguinte. */
  exDate: IsoDate;
  /** Fator como a B3 publica, em decimal (texto). */
  factor: string;
  approvedOn: IsoDate | null;
  isin: string;
}

const KINDS: Record<string, CorporateEventKind> = {
  DESDOBRAMENTO: 'desdobramento',
  GRUPAMENTO: 'grupamento',
  BONIFICACAO: 'bonificacao',
};

/** "300,00000000000" → "300"; "0,10000000000" → "0.1"; "9.900,00000000000" → "9900". */
function b3Decimal(text: string): string | null {
  const trimmed = text.trim();
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.replace(/\./g, '').split(',');
  const rest = fraction.replace(/0+$/, '');
  return rest ? `${whole}.${rest}` : whole;
}

function b3Date(text: unknown): IsoDate | null {
  if (typeof text !== 'string') return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return isIsoDate(date) ? date : null;
}

/**
 * Lê `stockDividends` da resposta. Cisão, redução de capital e outros tipos ficam de fora (o salto
 * continua marcado no gráfico); linha que não dá para ler vira aviso. Linhas repetidas (a B3 repete
 * o mesmo evento) viram uma só.
 */
export function parseB3Events(json: unknown): { events: CorporateEvent[]; warnings: string[] } {
  const company = Array.isArray(json) ? json[0] : json;
  const list = (company as { stockDividends?: unknown } | null | undefined)?.stockDividends;
  if (list === undefined || list === null) return { events: [], warnings: [] };
  if (!Array.isArray(list)) {
    return { events: [], warnings: ['eventos da B3 em formato inesperado'] };
  }
  const events = new Map<string, CorporateEvent>();
  const warnings: string[] = [];
  for (const item of list) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const label = typeof raw.label === 'string' ? raw.label.trim().toUpperCase() : '';
    const kind = KINDS[label.normalize('NFD').replace(/\p{Diacritic}/gu, '')];
    if (!kind) continue;
    const factor = typeof raw.factor === 'string' ? b3Decimal(raw.factor) : null;
    const exDate = b3Date(raw.lastDatePrior);
    const isin = typeof raw.isinCode === 'string' ? raw.isinCode.trim() : '';
    if (!factor || !/[1-9]/.test(factor) || !exDate || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) {
      warnings.push(`evento que não dá para ler: ${JSON.stringify(raw).slice(0, 200)}`);
      continue;
    }
    events.set(`${isin}|${kind}|${exDate}`, {
      kind,
      exDate,
      factor,
      approvedOn: b3Date(raw.approvedOn),
      isin,
    });
  }
  return { events: [...events.values()], warnings };
}
