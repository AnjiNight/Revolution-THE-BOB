import { describe, expect, it } from 'vitest';
import type { LedgerMovement } from './cash-ledger.js';
import { performance, type DailyClose, type PerformanceInput } from './performance.js';
import type { TradeMovement } from './positions.js';

const at = (date: string, hour = 15) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);

function deposit(id: string, amount: string, date: string): LedgerMovement {
  return { id, type: 'deposit', amount, date, recordedAt: at(date, 12) };
}

function withdrawal(id: string, amount: string, date: string): LedgerMovement {
  return { id, type: 'withdrawal', amount, date, recordedAt: at(date, 12) };
}

function buy(id: string, assetId: string, quantity: number, total: string, date: string) {
  const trade: TradeMovement = {
    id,
    assetId,
    type: 'buy',
    quantity,
    total,
    date,
    recordedAt: at(date),
  };
  const movement: LedgerMovement = { id, type: 'buy', amount: total, date, recordedAt: at(date) };
  return { trade, movement };
}

function input(
  parts: {
    movements: LedgerMovement[];
    trades?: TradeMovement[];
    closes?: Record<string, DailyClose[]>;
    days: string[];
    from?: string;
  } & Partial<Pick<PerformanceInput, 'income' | 'events' | 'live'>>,
): PerformanceInput {
  return {
    movements: parts.movements,
    trades: parts.trades ?? [],
    income: parts.income ?? [],
    events: parts.events ?? [],
    closes: new Map(Object.entries(parts.closes ?? {})),
    days: parts.days,
    from: parts.from ?? parts.days[0] ?? '2026-01-01',
    ...(parts.live ? { live: parts.live } : {}),
  };
}

describe('rentabilidade pela cota (SPEC-019, decisões 1 e 2)', () => {
  const petr = buy('t1', 'petr', 100, '2530.00', '2026-01-02');
  const closes = {
    petr: [
      { date: '2026-01-02', close: '25.30' },
      { date: '2026-01-05', close: '26.00' },
      { date: '2026-01-06', close: '26.00' },
      { date: '2026-01-07', close: '26.00' },
    ],
  };

  it('os exemplos do §4.3: alta de PETR4, aporte e retirada que não mudam a %', () => {
    const result = performance(
      input({
        movements: [
          deposit('d1', '10000.00', '2026-01-02'),
          petr.movement,
          deposit('d2', '5000.00', '2026-01-06'),
          withdrawal('w1', '2000.00', '2026-01-07'),
        ],
        trades: [petr.trade],
        closes,
        days: ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'],
      }),
    );
    expect(result.points.map((p) => [p.date, p.equity, p.invested, p.return])).toEqual([
      ['2026-01-02', '10000.00', '10000.00', '0.00'],
      ['2026-01-05', '10070.00', '10000.00', '0.70'],
      ['2026-01-06', '15070.00', '15000.00', '0.70'],
      ['2026-01-07', '13070.00', '13000.00', '0.70'],
    ]);
    expect(result).toMatchObject({
      startValue: '0.00',
      endValue: '13070.00',
      netFlows: '13000.00',
      result: '70.00',
      return: '0.70',
    });
  });

  it('período depois do início: patrimônio inicial é o do pregão anterior', () => {
    const result = performance(
      input({
        movements: [deposit('d1', '10000.00', '2026-01-02'), petr.movement],
        trades: [petr.trade],
        closes,
        days: ['2026-01-02', '2026-01-05', '2026-01-06'],
        from: '2026-01-06',
      }),
    );
    expect(result).toMatchObject({
      startValue: '10070.00',
      endValue: '10070.00',
      netFlows: '0.00',
      result: '0.00',
      return: '0.00',
    });
    expect(result.points).toHaveLength(1);
  });

  it('cota × conta simples: dobra, aporte grande e queda de 10% = +80%', () => {
    const fund = buy('t1', 'x', 1000, '10000.00', '2026-01-02');
    const extra = buy('t2', 'x', 5000, '100000.00', '2026-01-30');
    const result = performance(
      input({
        movements: [
          deposit('d1', '10000.00', '2026-01-02'),
          fund.movement,
          deposit('d2', '100000.00', '2026-01-30'),
          extra.movement,
        ],
        trades: [fund.trade, extra.trade],
        closes: {
          x: [
            { date: '2026-01-02', close: '10.00' },
            { date: '2026-01-29', close: '20.00' },
            { date: '2026-01-30', close: '20.00' },
            { date: '2026-02-27', close: '18.00' },
          ],
        },
        days: ['2026-01-02', '2026-01-29', '2026-01-30', '2026-02-27'],
      }),
    );
    expect(result.endValue).toBe('108000.00');
    expect(result.return).toBe('80.00');
    expect(result.result).toBe('-2000.00');
  });

  it('provento pago conta como ganho', () => {
    const result = performance(
      input({
        movements: [deposit('d1', '10000.00', '2026-01-02'), petr.movement],
        trades: [petr.trade],
        income: [
          {
            id: 'i',
            assetId: 'petr',
            kind: 'dividendo',
            exDate: '2026-01-02',
            paymentDate: '2026-01-05',
            value: '0.5',
          },
        ],
        closes: { petr: [{ date: '2026-01-02', close: '25.30' }] },
        days: ['2026-01-02', '2026-01-05'],
      }),
    );
    expect(result.points.at(-1)).toMatchObject({ equity: '10050.00', return: '0.50' });
    expect(result.result).toBe('50.00');
  });

  it('patrimônio zero rende 0% e a cota segue no próximo aporte', () => {
    const result = performance(
      input({
        movements: [
          deposit('d1', '1000.00', '2026-01-02'),
          withdrawal('w1', '1000.00', '2026-01-05'),
          deposit('d2', '500.00', '2026-01-07'),
        ],
        days: ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'],
      }),
    );
    expect(result.points.map((p) => p.return)).toEqual(['0.00', '0.00', '0.00', '0.00']);
    expect(result.endValue).toBe('500.00');
  });

  it('aporte de fim de semana entra no pregão seguinte; sem dias, tudo zero', () => {
    const result = performance(
      input({
        movements: [deposit('d1', '1000.00', '2026-01-03')],
        days: ['2026-01-05'],
      }),
    );
    expect(result.points).toEqual([
      { date: '2026-01-05', equity: '1000.00', invested: '1000.00', return: '0.00' },
    ]);
    expect(performance(input({ movements: [], days: [] })).points).toEqual([]);
  });
});

describe('preço de cada dia (SPEC-019, decisão 3)', () => {
  it('sem negócio no dia vale o último fechamento; hoje, a cotação do pregão', () => {
    const petr = buy('t1', 'petr', 100, '2530.00', '2026-01-02');
    const result = performance(
      input({
        movements: [deposit('d1', '2530.00', '2026-01-02'), petr.movement],
        trades: [petr.trade],
        closes: { petr: [{ date: '2026-01-02', close: '25.30' }] },
        days: ['2026-01-02', '2026-01-05', '2026-01-06'],
        live: { date: '2026-01-06', prices: new Map([['petr', '27.004']]) },
      }),
    );
    expect(result.points.map((p) => p.equity)).toEqual(['2530.00', '2530.00', '2700.00']);
  });

  it('desdobramento: quantidade corrigida com o fechamento publicado, sem salto falso', () => {
    const mglu = buy('t1', 'mglu', 100, '4000.00', '2020-10-09');
    const result = performance(
      input({
        movements: [deposit('d1', '4000.00', '2020-10-09'), mglu.movement],
        trades: [mglu.trade],
        events: [
          {
            id: 'e',
            assetId: 'mglu',
            kind: 'desdobramento',
            exDate: '2020-10-13',
            factor: '300',
            close: '40.00',
          },
        ],
        closes: {
          mglu: [
            { date: '2020-10-09', close: '40.00' },
            { date: '2020-10-13', close: '40.00' },
            { date: '2020-10-14', close: '10.00' },
          ],
        },
        days: ['2020-10-09', '2020-10-13', '2020-10-14'],
      }),
    );
    expect(result.points.map((p) => p.equity)).toEqual(['4000.00', '4000.00', '4000.00']);
    expect(result.warnings).toEqual([]);
  });

  it('salto sem evento conhecido, com o ativo em posição, vira aviso (decisão 5)', () => {
    const mglu = buy('t1', 'mglu', 100, '27600.00', '2019-08-02');
    const result = performance(
      input({
        movements: [deposit('d1', '27600.00', '2019-08-02'), mglu.movement],
        trades: [mglu.trade],
        closes: {
          mglu: [
            { date: '2019-08-02', close: '276.00' },
            { date: '2019-08-05', close: '276.00' },
            { date: '2019-08-06', close: '36.60' },
          ],
        },
        days: ['2019-08-02', '2019-08-05', '2019-08-06'],
      }),
    );
    expect(result.warnings).toEqual([
      { kind: 'unexplained_jump', assetId: 'mglu', date: '2019-08-06' },
    ]);
  });

  it('sem fechamento ainda: vale o preço da compra, com aviso', () => {
    const novo = buy('t1', 'novo', 10, '100.00', '2026-01-02');
    const result = performance(
      input({
        movements: [deposit('d1', '100.00', '2026-01-02'), novo.movement],
        trades: [novo.trade],
        closes: { novo: [{ date: '2026-01-06', close: '12.00' }] },
        days: ['2026-01-02', '2026-01-05', '2026-01-06'],
      }),
    );
    expect(result.points.map((p) => p.equity)).toEqual(['100.00', '100.00', '120.00']);
    expect(result.warnings).toEqual([{ kind: 'no_close', assetId: 'novo', until: '2026-01-05' }]);
  });

  it('10 anos de pregões com 0,01% ao dia: a % não acumula erro', () => {
    const days: string[] = [];
    const closes: DailyClose[] = [];
    let price = 10_000_000n; // R$ 100,000000 em milionésimos
    for (let i = 0; i < 2500; i += 1) {
      const date = new Date(Date.UTC(2016, 0, 4 + i)).toISOString().slice(0, 10);
      days.push(date);
      closes.push({ date, close: (Number(price) / 1e6).toFixed(6) });
      price = (price * 10_001n) / 10_000n;
    }
    const x = buy('t1', 'x', 10_000, '1000000.00', days[0] as string);
    const result = performance(
      input({
        movements: [deposit('d1', '1000000.00', days[0] as string), x.movement],
        trades: [x.trade],
        closes: { x: closes },
        days,
      }),
    );
    const last = closes.at(-1)?.close as string;
    const expected = (Number(last) / 100 - 1) * 100;
    expect(Math.abs(Number(result.return) - expected)).toBeLessThan(0.01);
  });
});
