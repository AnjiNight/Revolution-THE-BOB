import { describe, expect, it } from 'vitest';
import { cashLedger } from './cash-ledger.js';
import {
  firstTimelineBreak,
  timeline,
  type EventInput,
  type IncomeInput,
} from './corporate-actions.js';
import type { TradeMovement } from './positions.js';

const at = (iso: string) => new Date(iso);

function buy(id: string, assetId: string, quantity: number, total: string, date: string) {
  return {
    id,
    assetId,
    type: 'buy',
    quantity,
    total,
    date,
    recordedAt: at(`${date}T15:00:00Z`),
  } satisfies TradeMovement;
}

function sell(id: string, assetId: string, quantity: number, total: string, date: string) {
  return { ...buy(id, assetId, quantity, total, date), type: 'sell' } satisfies TradeMovement;
}

function income(
  id: string,
  assetId: string,
  kind: IncomeInput['kind'],
  exDate: string,
  paymentDate: string | null,
  value: string,
): IncomeInput {
  return { id, assetId, kind, exDate, paymentDate, value };
}

describe('proventos na carteira (SPEC-043, decisões 2, 3 e 6)', () => {
  it('rendimento de FII pago entra no caixa; o de pagamento futuro fica a receber (§4.3)', () => {
    const result = timeline({
      trades: [buy('t1', 'mxrf', 100, '1000.00', '2026-09-01')],
      income: [
        income('i1', 'mxrf', 'rendimento', '2026-09-30', '2026-10-15', '0.1'),
        income('i2', 'mxrf', 'rendimento', '2026-10-30', '2026-11-16', '0.095'),
      ],
      events: [],
      until: '2026-11-06',
    });
    expect(result.movements.map((m) => [m.date, m.amount])).toEqual([['2026-10-15', '10.00']]);
    expect(result.pending.map((p) => [p.paymentDate, p.net])).toEqual([['2026-11-16', '9.50']]);
    expect(result.received.get('mxrf')).toBe(1000n);
  });

  it('quem compra no dia seguinte à data com não recebe; quem compra na data com, sim', () => {
    const value = [income('i2', 'mxrf', 'rendimento', '2026-10-30', '2026-11-16', '0.095')];
    const late = timeline({
      trades: [buy('t1', 'mxrf', 100, '1000.00', '2026-10-31')],
      income: value,
      events: [],
      until: '2026-11-20',
    });
    expect(late.movements).toEqual([]);
    const onTime = timeline({
      trades: [buy('t1', 'mxrf', 100, '1000.00', '2026-10-30')],
      income: value,
      events: [],
      until: '2026-11-20',
    });
    expect(onTime.movements.map((m) => m.amount)).toEqual(['9.50']);
  });

  it('venda na data com tira o provento; sem data de pagamento fica a receber', () => {
    const result = timeline({
      trades: [
        buy('t1', 'petr', 100, '3000.00', '2026-08-01'),
        sell('t2', 'petr', 100, '3100.00', '2026-08-21'),
      ],
      income: [income('i1', 'petr', 'dividendo', '2026-08-21', null, '0.47156696')],
      events: [],
      until: '2026-11-06',
    });
    expect(result.pending).toEqual([]);
    const kept = timeline({
      trades: [buy('t1', 'petr', 100, '3000.00', '2026-08-01')],
      income: [income('i1', 'petr', 'dividendo', '2026-08-21', null, '0.47156696')],
      events: [],
      until: '2026-11-06',
    });
    // 100 × 0,47156696 = 47,156696: para baixo em centavos.
    expect(kept.pending.map((p) => [p.paymentDate, p.gross, p.net])).toEqual([
      [null, '47.15', '47.15'],
    ]);
  });

  it('JCP líquido: 15% até 2025 e 17,5% a partir de 2026, IR arredondado para cima', () => {
    const result = timeline({
      trades: [buy('t1', 'petr', 100, '3000.00', '2025-01-02')],
      income: [
        income('a', 'petr', 'jcp', '2025-06-02', '2025-08-20', '0.67407131'),
        income('b', 'petr', 'jcp', '2026-08-21', '2026-11-23', '0.67407131'),
      ],
      events: [],
      until: '2026-12-31',
    });
    expect(result.movements.map((m) => (m.kind === 'income' ? m.income : null))).toMatchObject([
      { gross: '67.40', tax: '10.11', net: '57.29' },
      { gross: '67.40', tax: '11.80', net: '55.60' },
    ]);
  });

  it('amortização de FII entra no caixa e baixa o preço médio, sem ficar negativo (decisão 4)', () => {
    const result = timeline({
      trades: [buy('t1', 'fii', 10, '100.00', '2026-01-05')],
      income: [
        income('a', 'fii', 'amortizacao', '2026-02-02', '2026-02-10', '1.5'),
        income('b', 'fii', 'amortizacao', '2026-03-02', '2026-03-10', '20'),
      ],
      events: [],
      until: '2026-04-01',
    });
    expect(result.movements.map((m) => m.amount)).toEqual(['15.00', '200.00']);
    expect(result.holdings.get('fii')?.averagePrice).toBe('0.000000');
  });

  it('valor menor que um centavo não gera nada', () => {
    const result = timeline({
      trades: [buy('t1', 'x', 1, '10.00', '2026-01-05')],
      income: [income('a', 'x', 'dividendo', '2026-02-02', '2026-02-10', '0.004')],
      events: [],
      until: '2026-04-01',
    });
    expect(result.movements).toEqual([]);
  });
});

describe('eventos corporativos na carteira (SPEC-043, decisão 5)', () => {
  const split: EventInput = {
    id: 'e1',
    assetId: 'mglu',
    kind: 'desdobramento',
    exDate: '2020-10-13',
    factor: '300',
    close: '100.00',
  };
  const reverse: EventInput = {
    id: 'e2',
    assetId: 'mglu',
    kind: 'grupamento',
    exDate: '2024-05-24',
    factor: '0.1',
    close: '1.32',
  };

  it('desdobramento de 300%: 100 a R$ 40,00 viram 400 a R$ 10,00 no dia seguinte à data com', () => {
    const trades = [buy('t1', 'mglu', 100, '4000.00', '2019-06-10')];
    const before = timeline({ trades, income: [], events: [split], until: '2020-10-13' });
    expect(before.holdings.get('mglu')).toMatchObject({ quantity: 100 });
    const after = timeline({ trades, income: [], events: [split], until: '2020-10-14' });
    expect(after.holdings.get('mglu')).toMatchObject({
      quantity: 400,
      averagePrice: '10.000000',
    });
    expect(after.events).toEqual([
      {
        id: 'e1',
        assetId: 'mglu',
        kind: 'desdobramento',
        exDate: '2020-10-13',
        multiplier: '4',
        quantityBefore: 100,
        quantityAfter: 400,
      },
    ]);
  });

  it('grupamento de 10 para 1 com 405: 40 ações e a fração de 0,5 vendida por R$ 6,60', () => {
    const result = timeline({
      trades: [
        buy('t1', 'mglu', 100, '4000.00', '2019-06-10'),
        buy('t2', 'mglu', 5, '20.00', '2021-03-01'),
      ],
      income: [],
      events: [split, reverse],
      until: '2026-11-06',
    });
    expect(result.holdings.get('mglu')?.quantity).toBe(40);
    expect(result.movements).toMatchObject([
      {
        type: 'income',
        kind: 'fraction',
        amount: '6.60',
        date: '2024-05-25',
        fraction: { shares: '0.5', price: '13.20' },
      },
    ]);
  });

  it('bonificação de 2% com 120: 122 ações, custo igual; sem fechamento a fração some', () => {
    const result = timeline({
      trades: [buy('t1', 'itsa', 120, '1224.00', '2025-06-02')],
      income: [],
      events: [
        {
          id: 'b',
          assetId: 'itsa',
          kind: 'bonificacao',
          exDate: '2025-12-18',
          factor: '2',
          close: null,
        },
      ],
      until: '2026-01-05',
    });
    expect(result.holdings.get('itsa')).toMatchObject({ quantity: 122, averagePrice: '10.000000' });
    expect(result.movements).toEqual([]);
  });

  it('o provento depois do desdobramento conta as ações novas', () => {
    const result = timeline({
      trades: [buy('t1', 'mglu', 100, '4000.00', '2019-06-10')],
      income: [income('d', 'mglu', 'dividendo', '2020-11-02', '2020-11-20', '0.01')],
      events: [split],
      until: '2026-11-06',
    });
    expect(result.movements.map((m) => m.amount)).toEqual(['4.00']);
  });

  it('venda maior que a posição (feita antes de um grupamento) vende tudo e é anotada', () => {
    const result = timeline({
      trades: [
        buy('t1', 'mglu', 100, '400.00', '2024-01-02'),
        sell('t2', 'mglu', 100, '150.00', '2025-01-02'),
      ],
      income: [],
      events: [reverse],
      until: '2026-11-06',
    });
    expect(result.oversold).toEqual(['t2']);
    expect(result.holdings.size).toBe(0);
  });
});

describe('conferência do livro com proventos (SPEC-043 §4.2)', () => {
  it('o gasto que só cabe com o provento passa; sem o provento, quebra no gasto', () => {
    const deposit = {
      id: 'd',
      type: 'deposit' as const,
      amount: '1000.00',
      date: '2026-09-01',
      recordedAt: at('2026-09-01T12:00:00Z'),
    };
    const purchase = {
      id: 't1',
      type: 'buy' as const,
      amount: '1000.00',
      date: '2026-09-01',
      recordedAt: at('2026-09-01T13:00:00Z'),
    };
    const withdrawal = {
      id: 'w',
      type: 'withdrawal' as const,
      amount: '10.00',
      date: '2026-10-20',
      recordedAt: at('2026-10-20T12:00:00Z'),
    };
    const { movements } = timeline({
      trades: [buy('t1', 'mxrf', 100, '1000.00', '2026-09-01')],
      income: [income('i1', 'mxrf', 'rendimento', '2026-09-30', '2026-10-15', '0.1')],
      events: [],
      until: '2026-11-06',
    });
    expect(firstTimelineBreak([deposit, purchase, withdrawal, ...movements], [])).toBeNull();
    expect(cashLedger([deposit, purchase, withdrawal, ...movements]).balance).toBe('0.00');
    expect(firstTimelineBreak([deposit, purchase, withdrawal], [])).toEqual({
      id: 'w',
      reason: 'cash',
    });
    expect(firstTimelineBreak([deposit], ['d'])).toEqual({ id: 'd', reason: 'position' });
  });
});
