import { describe, expect, it } from 'vitest';
import { cotahistHeader, cotahistLine, cotahistTrailer } from '../testing/cotahist-fixtures.js';
import { CotahistLineError, parseCotahistLine } from './cotahist.js';

const petr4 = {
  date: '20261028',
  ticker: 'PETR4',
  open: 3812,
  high: 3870,
  low: 3790,
  average: 3835,
  close: 3851,
  trades: 45210,
  volume: 158734512399,
};

describe('leitor do COTAHIST (CA01)', () => {
  it('a linha de teste segue o leiaute oficial da B3', () => {
    const line = cotahistLine(petr4);
    expect(line).toHaveLength(245);
    expect(line.slice(2, 10)).toBe('20261028'); // DATA 3–10
    expect(line.slice(12, 24).trim()).toBe('PETR4'); // CODNEG 13–24
    expect(line.slice(108, 121)).toBe('0000000003851'); // PREULT 109–121
    expect(line.slice(210, 217)).toBe('0000001'); // FATCOT 211–217
  });

  it('lê data, ticker, preços, negócios e volume de uma ação', () => {
    expect(parseCotahistLine(cotahistLine(petr4))).toEqual({
      date: '2026-10-28',
      ticker: 'PETR4',
      open: '38.120000',
      high: '38.700000',
      low: '37.900000',
      close: '38.510000',
      average: '38.350000',
      trades: 45210,
      volume: '1587345123.99',
    });
  });

  it('lê units e FIIs (CODBDI 12) do mercado à vista', () => {
    const unit = parseCotahistLine(
      cotahistLine({ ...petr4, ticker: 'TAEE11', open: 3500, high: 3500, low: 3500, close: 3500 }),
    );
    expect(unit?.ticker).toBe('TAEE11');
    const fii = parseCotahistLine(
      cotahistLine({
        ...petr4,
        ticker: 'MXRF11',
        codbdi: '12',
        open: 990,
        high: 995,
        low: 985,
        average: 990,
        close: 992,
      }),
    );
    expect(fii).toMatchObject({ ticker: 'MXRF11', close: '9.920000' });
  });

  it('divide os preços pelo fator de cotação, arredondando a 6 casas meio para cima', () => {
    const quote = parseCotahistLine(
      cotahistLine({
        ...petr4,
        quoteFactor: 1000,
        open: 1,
        high: 3,
        low: 1,
        average: 2,
        close: 3,
      }),
    );
    // 0,01 por lote de mil = 0,00001 por ação; 0,03 / 1000 = 0,00003.
    expect(quote).toMatchObject({ open: '0.000010', close: '0.000030', high: '0.000030' });
    const rounded = parseCotahistLine(
      cotahistLine({ ...petr4, quoteFactor: 3, open: 100, high: 100, low: 100, close: 100 }),
    );
    expect(rounded?.close).toBe('0.333333'); // 1,00 / 3
    const up = parseCotahistLine(
      cotahistLine({ ...petr4, quoteFactor: 3, open: 200, high: 200, low: 200, close: 200 }),
    );
    expect(up?.close).toBe('0.666667'); // 2,00 / 3, meio para cima
  });

  it('ignora cabeçalho, rodapé, fracionário e outros mercados', () => {
    expect(parseCotahistLine(cotahistHeader())).toBeNull();
    expect(parseCotahistLine(cotahistTrailer(10))).toBeNull();
    expect(
      parseCotahistLine(cotahistLine({ ...petr4, ticker: 'PETR4F', market: '020' })),
    ).toBeNull();
    expect(
      parseCotahistLine(cotahistLine({ ...petr4, ticker: 'PETRK380', market: '070' })),
    ).toBeNull();
    expect(parseCotahistLine('')).toBeNull();
  });

  it('aceita a linha com CR no fim (o arquivo usa CRLF)', () => {
    expect(parseCotahistLine(`${cotahistLine(petr4)}\r`)?.ticker).toBe('PETR4');
  });

  it('linha malformada vira CotahistLineError com o ticker e a data quando dá para saber', () => {
    const line = cotahistLine(petr4);
    expect(() => parseCotahistLine(line.slice(0, 200))).toThrow(CotahistLineError);

    const badPrice = `${line.slice(0, 56)}00000000ABC12${line.slice(69)}`;
    try {
      parseCotahistLine(badPrice);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CotahistLineError);
      expect(error).toMatchObject({ ticker: 'PETR4', date: '2026-10-28' });
      expect((error as Error).message).toMatch(/open/);
    }

    const badDate = cotahistLine({ ...petr4, date: '20260230' });
    expect(() => parseCotahistLine(badDate)).toThrow(/data inválida/);
    expect(() => parseCotahistLine(cotahistLine({ ...petr4, quoteFactor: 0 }))).toThrow(/fator/);
  });

  it('recusa preços fora da faixa do dia ou zerados', () => {
    expect(() => parseCotahistLine(cotahistLine({ ...petr4, close: 3900 }))).toThrow(/faixa/);
    expect(() => parseCotahistLine(cotahistLine({ ...petr4, open: 3700 }))).toThrow(/faixa/);
    expect(() =>
      parseCotahistLine(cotahistLine({ ...petr4, open: 0, high: 0, low: 0, average: 0, close: 0 })),
    ).toThrow(/zero/);
  });
});
