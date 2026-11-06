import { describe, expect, it } from 'vitest';
import { canWithdraw, cashLedger, toCents, type LedgerMovement } from './cash-ledger.js';

const at = (iso: string) => new Date(iso);

const movement = (
  id: string,
  type: LedgerMovement['type'],
  amount: string,
  date: string,
  recordedAt = `${date}T15:00:00Z`,
): LedgerMovement => ({ id, type, amount, date, recordedAt: at(recordedAt) });

describe('conta do caixa (SPEC-013, CA01)', () => {
  it('sem lançamentos, o saldo é zero', () => {
    expect(cashLedger([])).toEqual({ lines: [], balance: '0.00' });
  });

  it('aportes menos retiradas, com o saldo depois de cada lançamento (contas à mão)', () => {
    const ledger = cashLedger([
      movement('a', 'deposit', '1000.00', '2019-01-02'),
      movement('b', 'withdrawal', '250.10', '2019-01-03'),
      movement('c', 'deposit', '0.01', '2019-01-04'),
      movement('d', 'withdrawal', '749.91', '2019-01-07'),
    ]);
    expect(ledger.lines.map((line) => line.balanceAfter)).toEqual([
      '1000.00',
      '749.90',
      '749.91',
      '0.00',
    ]);
    expect(ledger.balance).toBe('0.00');
  });

  it('centavos sem erro de ponto flutuante: 0,10 + 0,20 = 0,30', () => {
    const ledger = cashLedger([
      movement('a', 'deposit', '0.10', '2026-11-05'),
      movement('b', 'deposit', '0.20', '2026-11-05', '2026-11-05T16:00:00Z'),
    ]);
    expect(ledger.balance).toBe('0.30');
  });

  it('o teto somado muitas vezes não estoura: 12 × R$ 10.000.000,00', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      movement(`m${i}`, 'deposit', '10000000.00', '2026-11-05', `2026-11-05T15:00:0${i % 10}Z`),
    );
    expect(cashLedger(many).balance).toBe('120000000.00');
  });

  it('ordem do livro: o dia, depois o momento do registro, depois o id', () => {
    const ledger = cashLedger([
      movement('z', 'withdrawal', '100', '2019-03-15', '2026-11-05T10:00:00Z'),
      movement('b', 'deposit', '50', '2019-03-15', '2026-11-05T09:00:00Z'),
      movement('a', 'deposit', '500', '2019-03-10', '2026-11-05T12:00:00Z'),
      movement('c', 'deposit', '1', '2019-03-15', '2026-11-05T09:00:00Z'),
    ]);
    expect(ledger.lines.map((line) => line.id)).toEqual(['a', 'b', 'c', 'z']);
    expect(ledger.lines.map((line) => line.balanceAfter)).toEqual([
      '500.00',
      '550.00',
      '551.00',
      '451.00',
    ]);
  });

  it('valor inválido no livro é erro (não passa em silêncio)', () => {
    expect(() => cashLedger([movement('a', 'deposit', '0', '2019-01-02')])).toThrow(RangeError);
    expect(() => cashLedger([movement('a', 'deposit', '1.001', '2019-01-02')])).toThrow(RangeError);
  });
});

describe('retirada cabe no saldo? (RB26)', () => {
  it('igual ao saldo cabe; um centavo a mais não', () => {
    expect(canWithdraw('1000.00', '1000.00')).toBe(true);
    expect(canWithdraw('1000.00', '1000.01')).toBe(false);
    expect(canWithdraw('0.00', '0.01')).toBe(false);
  });

  it('lê valores com sinal e sem limite de tamanho', () => {
    expect(toCents('-0.05')).toBe(-5n);
    expect(toCents('120000000.00')).toBe(12000000000n);
    expect(() => toCents('1,00')).toThrow(RangeError);
  });
});
