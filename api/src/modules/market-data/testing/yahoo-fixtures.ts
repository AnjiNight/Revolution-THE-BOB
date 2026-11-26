/**
 * SPEC-048: respostas reais da rota de gráfico da Yahoo Finance, gravadas em 21/11/2026 (só as duas
 * últimas marcas do gráfico de 5 minutos; o resumo `meta` está inteiro).
 */

/** `^BVSP`: o último pregão foi quinta, 19/11 (20/11 é feriado da Consciência Negra). */
export const YAHOO_IBOVESPA = {
  chart: {
    result: [
      {
        meta: {
          currency: 'BRL',
          symbol: '^BVSP',
          exchangeName: 'SAO',
          fullExchangeName: 'São Paulo',
          instrumentType: 'INDEX',
          firstTradeDate: 735915600,
          regularMarketTime: 1795123200,
          hasPrePostMarketData: false,
          gmtoffset: -10800,
          timezone: 'BRT',
          exchangeTimezoneName: 'America/Sao_Paulo',
          regularMarketPrice: 166376.44,
          regularMarketChangePercent: -0.693,
          fulldayPrice: 166376.44,
          fulldayChange: -1161.562,
          fulldayChangePercent: -0.693,
          fiftyTwoWeekHigh: 209714,
          fiftyTwoWeekLow: 154529,
          regularMarketDayHigh: 168498.42,
          regularMarketDayLow: 165833.3,
          regularMarketVolume: 0,
          longName: 'IBOVESPA',
          shortName: 'IBOVESPA',
          chartPreviousClose: 167538,
          previousClose: 167538,
          scale: 3,
          priceHint: 2,
          currentTradingPeriod: {
            pre: {
              timezone: 'BRT',
              start: 1795092300,
              end: 1795093200,
              gmtoffset: -10800,
            },
            regular: {
              timezone: 'BRT',
              start: 1795093200,
              end: 1795118400,
              gmtoffset: -10800,
            },
            post: {
              timezone: 'BRT',
              start: 1795118400,
              end: 1795122000,
              gmtoffset: -10800,
            },
          },
          tradingPeriods: [
            [
              {
                timezone: 'BRT',
                start: 1795093200,
                end: 1795118400,
                gmtoffset: -10800,
              },
            ],
          ],
          dataGranularity: '5m',
          range: '1d',
          validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'],
        },
        timestamp: [1795118100, 1795118400],
        indicators: {
          quote: [
            {
              close: [166054.046875, 166376.4375],
            },
          ],
        },
      },
    ],
    error: null,
  },
} as const;

/** `BRL=X`: o dólar no sábado de manhã, 21/11. */
export const YAHOO_DOLLAR = {
  chart: {
    result: [
      {
        meta: {
          currency: 'BRL',
          symbol: 'BRL=X',
          exchangeName: 'CCY',
          fullExchangeName: 'CCY',
          instrumentType: 'CURRENCY',
          firstTradeDate: 1070236800,
          regularMarketTime: 1795258694,
          hasPrePostMarketData: false,
          gmtoffset: 0,
          timezone: 'GMT',
          exchangeTimezoneName: 'Europe/London',
          regularMarketPrice: 5.9074,
          regularMarketChangePercent: 0.0373,
          fulldayPrice: 5.9074,
          fulldayChange: 0.0022,
          fulldayChangePercent: 0.0373,
          fiftyTwoWeekHigh: 5.949,
          fiftyTwoWeekLow: 4.8812,
          regularMarketDayHigh: 5.9074,
          regularMarketDayLow: 5.9074,
          regularMarketVolume: 0,
          longName: 'USD/BRL',
          shortName: 'USD/BRL',
          chartPreviousClose: 5.9052,
          previousClose: 5.9052,
          scale: 4,
          priceHint: 4,
          currentTradingPeriod: {
            pre: {
              timezone: 'GMT',
              start: 1795132800,
              end: 1795132800,
              gmtoffset: 0,
            },
            regular: {
              timezone: 'GMT',
              start: 1795132800,
              end: 1795219140,
              gmtoffset: 0,
            },
            post: {
              timezone: 'GMT',
              start: 1795219140,
              end: 1795219140,
              gmtoffset: 0,
            },
          },
          tradingPeriods: [
            [
              {
                timezone: 'GMT',
                start: 1795132800,
                end: 1795219140,
                gmtoffset: 0,
              },
            ],
          ],
          dataGranularity: '5m',
          range: '1d',
          validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'],
        },
        timestamp: [1795218600, 1795218900],
        indicators: {
          quote: [
            {
              close: [null, null],
            },
          ],
        },
      },
    ],
    error: null,
  },
} as const;

/** Símbolo sem dados (testado com `^IFIX.SA`): 404. */
export const YAHOO_NOT_FOUND = {
  chart: {
    result: null,
    error: { code: 'Not Found', description: 'No data found, symbol may be delisted' },
  },
} as const;
