import type { CashEntry } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import {
  incomeReceived,
  needsMorePages,
  oldestSavedAt,
  reportPeriod,
  statementForReport,
} from './report';

function entry(id: string, date: string, extra: Partial<CashEntry> = {}): CashEntry {
  return {
    id,
    type: 'deposit',
    amount: '100.00',
    date,
    recordedAt: `${date}T13:00:00.000Z`,
    balanceAfter: '100.00',
    reversedAt: null,
    reversible: false,
    ...extra,
  };
}

const income = (id: string, date: string, amount: string) =>
  entry(id, date, {
    type: 'income',
    amount,
    income: {
      assetId: 'a',
      ticker: 'MXRF11',
      kind: 'rendimento',
      quantity: 10,
      perShare: '0.1',
      gross: amount,
      tax: '0.00',
      net: amount,
      exDate: '2026-10-31',
      paymentDate: date,
      source: 'investidor10',
    },
  });

describe('relatório da carteira (SPEC-038)', () => {
  it('extrato do período, do mais antigo para o mais recente, sem os estornados (CA02)', () => {
    // Como o servidor manda: do mais recente para o mais antigo.
    const entries = [
      entry('5', '2026-12-01'),
      entry('4', '2026-11-10'),
      entry('3', '2026-11-03', { reversedAt: '2026-11-03T15:00:00.000Z', balanceAfter: null }),
      entry('2', '2026-11-01'),
      entry('1', '2026-10-31'),
    ];
    const statement = statementForReport(entries, '2026-11-01', '2026-11-30');
    expect(statement.entries.map((item) => item.id)).toEqual(['2', '4']);
    expect(statement.reversed).toBe(1);
    expect(statementForReport([], '2026-11-01', '2026-11-30')).toEqual({
      entries: [],
      reversed: 0,
    });
  });

  it('para de ler o extrato quando a página chega antes do início do período', () => {
    const page = [entry('2', '2026-11-05'), entry('1', '2026-11-01')];
    expect(needsMorePages(page, true, '2026-11-01')).toBe(true); // pode haver mais do mesmo dia
    expect(needsMorePages(page, true, '2026-11-02')).toBe(false);
    expect(needsMorePages(page, false, '2026-01-01')).toBe(false);
    expect(needsMorePages([], true, '2026-01-01')).toBe(false);
  });

  it('proventos recebidos somados em centavos exatos, sem a venda de fração', () => {
    const entries = [
      income('1', '2026-11-03', '0.10'),
      income('2', '2026-11-04', '0.20'),
      // Venda de fração: entra no caixa como provento, mas não é provento.
      entry('3', '2026-11-05', {
        type: 'income',
        amount: '12.34',
        fraction: { assetId: 'a', ticker: 'ITSA4', shares: '0.5', price: '24.68' },
      }),
      entry('4', '2026-11-06', { type: 'deposit', amount: '500.00' }),
      income('5', '2026-11-07', '1234.56'),
    ];
    expect(incomeReceived(entries)).toBe('1234.86');
    expect(incomeReceived([])).toBe('0.00');
  });

  it('a data dos dados guardados é a da leitura mais antiga; do servidor, nenhuma', () => {
    expect(
      oldestSavedAt([
        { savedAt: '2026-11-16T21:12:00.000Z' },
        {},
        { savedAt: '2026-11-16T21:10:00.000Z' },
      ]),
    ).toBe('2026-11-16T21:10:00.000Z');
    expect(oldestSavedAt([{}, {}])).toBeNull();
  });

  it('o período vem da Rentabilidade', () => {
    expect(reportPeriod({ period: 'all' })).toBe('all');
    expect(reportPeriod({ period: '12m' })).toBe('12m');
    expect(reportPeriod({ from: '2026-01-02', to: '2026-06-30' })).toBe('custom');
  });
});
