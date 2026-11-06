import { describe, expect, it } from 'vitest';
import { cashLedger, type LedgerMovement } from './cash-ledger.js';
import {
  displayPrice,
  firstBreak,
  holdings,
  roundToCents,
  tradeTotal,
  valuate,
  type CheckedMovement,
  type TradeMovement,
} from './positions.js';

let seq = 0;
const trade = (
  type: 'buy' | 'sell',
  quantity: number,
  price: string,
  assetId = 'PETR4',
): TradeMovement => {
  seq += 1;
  return {
    id: `t${String(seq).padStart(3, '0')}`,
    assetId,
    type,
    quantity,
    total: tradeTotal(quantity, price),
    date: '2026-11-05',
    recordedAt: new Date(Date.UTC(2026, 10, 5, 15, 0, seq)),
  };
};

describe('posições e preço médio (SPEC-014, CA01)', () => {
  it('os exemplos do §4.3: compra, segunda compra e venda que não muda o preço médio', () => {
    const first = trade('buy', 100, '31.20');
    expect(first.total).toBe('3120.00');
    expect(holdings([first]).get('PETR4')).toEqual({
      assetId: 'PETR4',
      quantity: 100,
      averagePrice: '31.200000',
      since: '2026-11-05',
    });

    const second = trade('buy', 50, '32.10');
    expect(second.total).toBe('1605.00');
    // (3.120,00 + 1.605,00) ÷ 150 = 31,50
    expect(holdings([first, second]).get('PETR4')?.averagePrice).toBe('31.500000');

    const sale = trade('sell', 60, '33.00');
    expect(holdings([first, second, sale]).get('PETR4')).toEqual({
      assetId: 'PETR4',
      quantity: 90,
      averagePrice: '31.500000',
      since: '2026-11-05',
    });
  });

  it('preço médio com dízima: 6 casas na conta, 2 na tela', () => {
    const position = holdings([trade('buy', 1, '10.00'), trade('buy', 2, '10.01')]).get('PETR4');
    // 30,02 ÷ 3 = 10,006666… → 10,006667
    expect(position?.averagePrice).toBe('10.006667');
    expect(displayPrice(position?.averagePrice ?? '')).toBe('10.01');
  });

  it('a posição zerada sai e a próxima compra começa um preço médio novo', () => {
    const trades = [trade('buy', 10, '20.00'), trade('sell', 10, '25.00')];
    expect(holdings(trades).has('PETR4')).toBe(false);
    trades.push(trade('buy', 5, '30.00'));
    expect(holdings(trades).get('PETR4')).toMatchObject({ quantity: 5, averagePrice: '30.000000' });
  });

  it('cada ativo tem a sua posição; a ordem do livro manda, não a da lista', () => {
    const a = trade('buy', 10, '10.00', 'A');
    const b = trade('buy', 3, '50.00', 'B');
    const sellA = trade('sell', 4, '12.00', 'A');
    const result = holdings([sellA, b, a]);
    expect(result.get('A')).toMatchObject({ quantity: 6, averagePrice: '10.000000' });
    expect(result.get('B')).toMatchObject({ quantity: 3, averagePrice: '50.000000' });
  });

  it('venda maior que a posição e quantidade inválida são erro', () => {
    expect(() => holdings([trade('buy', 5, '10.00'), trade('sell', 6, '10.00')])).toThrow(
      RangeError,
    );
    expect(() => holdings([{ ...trade('buy', 1, '10.00'), quantity: 1.5 }])).toThrow(RangeError);
  });
});

describe('preço e total da negociação (SPEC-014 §4.2, RB13)', () => {
  it('a cotação vira preço com 2 casas, meio para cima', () => {
    expect(roundToCents('31.2')).toBe('31.20');
    expect(roundToCents('31.205000')).toBe('31.21');
    expect(roundToCents('31.204999')).toBe('31.20');
  });

  it('total exato em centavos, até o máximo de 1.000.000 de unidades', () => {
    expect(tradeTotal(32, '31.20')).toBe('998.40');
    expect(tradeTotal(1_000_000, '99.99')).toBe('99990000.00');
  });
});

describe('valor da posição (SPEC-014 §4.2)', () => {
  it('valor atual, custo e variação em reais e em %', () => {
    expect(
      valuate(
        { assetId: 'A', quantity: 90, averagePrice: '31.500000', since: '2026-11-05' },
        '33.00',
      ),
    ).toEqual({
      marketValue: '2970.00',
      cost: '2835.00',
      change: '135.00',
      changePercent: '4.76',
    });
    expect(
      valuate(
        { assetId: 'A', quantity: 3, averagePrice: '10.006667', since: '2026-11-05' },
        '9.50',
      ),
    ).toEqual({
      marketValue: '28.50',
      cost: '30.02',
      change: '-1.52',
      changePercent: '-5.06',
    });
  });
});

describe('caixa com compras e vendas (SPEC-014, CA02)', () => {
  it('aportes − retiradas − compras + vendas', () => {
    const at = (s: number) => new Date(Date.UTC(2026, 10, 5, 15, 0, s));
    const movements: LedgerMovement[] = [
      { id: 'a', type: 'deposit', amount: '5000.00', date: '2026-11-05', recordedAt: at(1) },
      { id: 'b', type: 'buy', amount: '3120.00', date: '2026-11-05', recordedAt: at(2) },
      { id: 'c', type: 'buy', amount: '1605.00', date: '2026-11-05', recordedAt: at(3) },
      { id: 'd', type: 'sell', amount: '1980.00', date: '2026-11-05', recordedAt: at(4) },
      { id: 'e', type: 'withdrawal', amount: '55.00', date: '2026-11-05', recordedAt: at(5) },
    ];
    const ledger = cashLedger(movements);
    expect(ledger.lines.map((line) => line.balanceAfter)).toEqual([
      '5000.00',
      '1880.00',
      '275.00',
      '2255.00',
      '2200.00',
    ]);
  });
});

describe('conferência do livro para o estorno (SPEC-015, CA01)', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 10, 6, 15, 0, s));
  const deposit = (id: string, amount: string, s: number): CheckedMovement => ({
    id,
    type: 'deposit',
    amount,
    date: '2026-11-06',
    recordedAt: at(s),
  });
  const deal = (
    id: string,
    type: 'buy' | 'sell',
    quantity: number,
    price: string,
    s: number,
  ): CheckedMovement => ({
    id,
    type,
    amount: tradeTotal(quantity, price),
    assetId: 'PETR4',
    quantity,
    date: '2026-11-06',
    recordedAt: at(s),
  });

  it('livro válido: nada quebra', () => {
    expect(
      firstBreak([
        deposit('a', '5000', 1),
        deal('b', 'buy', 100, '31.20', 2),
        deal('c', 'sell', 60, '33', 3),
      ]),
    ).toBeNull();
  });

  it('sem o aporte, a compra deixaria o caixa negativo', () => {
    // O livro com o aporte (a) estornado: só a compra sobra.
    expect(firstBreak([deal('b', 'buy', 100, '31.20', 2)])).toEqual({ id: 'b', reason: 'cash' });
  });

  it('sem a compra, a venda passaria da posição', () => {
    expect(firstBreak([deposit('a', '5000', 1), deal('c', 'sell', 60, '33', 3)])).toEqual({
      id: 'c',
      reason: 'position',
    });
  });

  it('o caixa pode chegar a zero, mas não abaixo', () => {
    expect(firstBreak([deposit('a', '3120', 1), deal('b', 'buy', 100, '31.20', 2)])).toBeNull();
    expect(
      firstBreak([
        deposit('a', '3120', 1),
        { id: 'w', type: 'withdrawal', amount: '0.01', date: '2026-11-06', recordedAt: at(3) },
        deal('b', 'buy', 100, '31.20', 2),
      ]),
    ).toEqual({ id: 'w', reason: 'cash' });
  });
});

describe('desde quando a posição está aberta (SPEC-016)', () => {
  const on = (id: string, type: 'buy' | 'sell', quantity: number, date: string): TradeMovement => ({
    id,
    assetId: 'PETR4',
    type,
    quantity,
    total: tradeTotal(quantity, '10.00'),
    date,
    recordedAt: new Date(`${date}T15:00:00Z`),
  });

  it('a primeira compra marca o início; compras depois não mudam; zerar e recomprar recomeça', () => {
    expect(
      holdings([on('a', 'buy', 10, '2019-03-15'), on('b', 'buy', 5, '2020-01-10')]).get('PETR4')
        ?.since,
    ).toBe('2019-03-15');
    expect(
      holdings([
        on('a', 'buy', 10, '2019-03-15'),
        on('b', 'sell', 10, '2019-06-03'),
        on('c', 'buy', 5, '2021-02-01'),
      ]).get('PETR4')?.since,
    ).toBe('2021-02-01');
    // Venda parcial não muda o início.
    expect(
      holdings([on('a', 'buy', 10, '2019-03-15'), on('b', 'sell', 4, '2019-06-03')]).get('PETR4')
        ?.since,
    ).toBe('2019-03-15');
  });
});
