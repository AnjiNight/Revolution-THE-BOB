import { describe, expect, it, vi } from 'vitest';
import { MarketQuoteSourceError } from '../application/ports.js';
import { YAHOO_DOLLAR, YAHOO_IBOVESPA, YAHOO_NOT_FOUND } from '../testing/yahoo-fixtures.js';
import { parseChart, YahooChartSource } from './yahoo-chart-source.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('adaptador da Yahoo Finance (SPEC-048)', () => {
  it('Ibovespa: valor, fechamento anterior e horário da resposta real gravada', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(YAHOO_IBOVESPA));
    const source = new YahooChartSource({ baseUrl: 'https://yahoo.test/', fetch });

    expect(await source.quote('ibovespa')).toEqual({
      at: new Date('2026-11-19T21:20:00Z'),
      value: '166376.44',
      previousClose: '167538',
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://yahoo.test/v8/finance/chart/%5EBVSP?range=1d&interval=5m');
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(
      /^SimuladorInvestimentos/,
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('dólar: 4 casas e o símbolo BRL=X', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(YAHOO_DOLLAR));
    const source = new YahooChartSource({ baseUrl: 'https://yahoo.test', fetch });

    expect(await source.quote('dollar')).toEqual({
      at: new Date('2026-11-21T10:58:14Z'),
      value: '5.9074',
      previousClose: '5.9052',
    });
    expect(fetch.mock.calls[0]?.[0]).toContain('/chart/BRL%3DX?');
  });

  it('símbolo sem dados (404): no_data', async () => {
    const source = new YahooChartSource({
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(YAHOO_NOT_FOUND, 404)),
    });
    await expect(source.quote('ibovespa')).rejects.toMatchObject({ kind: 'no_data' });
  });

  it('rede fora ou 5xx: unavailable; JSON quebrado: bad_response', async () => {
    const offline = new YahooChartSource({
      fetch: vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('fetch failed')),
    });
    await expect(offline.quote('dollar')).rejects.toMatchObject({ kind: 'unavailable' });

    const busy = new YahooChartSource({
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('', { status: 503 })),
    });
    await expect(busy.quote('dollar')).rejects.toMatchObject({ kind: 'unavailable' });

    const broken = new YahooChartSource({
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('<html>')),
    });
    await expect(broken.quote('dollar')).rejects.toMatchObject({ kind: 'bad_response' });
  });

  it('arredonda o ponto flutuante cru para 6 casas e recusa valor zerado', () => {
    const body = (meta: Record<string, unknown>) => ({
      chart: { result: [{ meta }], error: null },
    });
    expect(
      parseChart(
        body({ regularMarketPrice: 5.905200004577637, regularMarketTime: 1795258694 }),
        'BRL=X',
      ),
    ).toMatchObject({ value: '5.9052', previousClose: null });
    expect(() => parseChart(body({ regularMarketPrice: 0, regularMarketTime: 1 }), 'X')).toThrow(
      MarketQuoteSourceError,
    );
    expect(() => parseChart({ chart: { result: [] } }, 'X')).toThrow(/sem o resumo/);
  });
});
