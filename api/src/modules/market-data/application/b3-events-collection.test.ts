import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseB3Events } from '../domain/b3-events.js';
import {
  FakeB3CompanySource,
  InMemoryB3Trades,
  InMemoryEvents,
  InMemoryFundamentals,
  InMemoryTaskRuns,
} from '../testing/fakes.js';
import { B3EventsCollection } from './b3-events-collection.js';

/** Resposta da página da empresa no formato da B3 (conferido em 04/11/2026). */
const mglu = [
  {
    code: 'MGLU',
    stockDividends: [
      {
        label: 'DESDOBRAMENTO',
        factor: '300,00000000000',
        lastDatePrior: '13/10/2020',
        approvedOn: '22/09/2020',
        isinCode: 'BRMGLUACNOR2',
      },
      {
        label: 'GRUPAMENTO',
        factor: '0,10000000000',
        lastDatePrior: '24/05/2024',
        approvedOn: '18/04/2024',
        isinCode: 'BRMGLUACNOR2',
      },
      {
        label: 'CIS RED CAP',
        factor: '100,00000000000',
        lastDatePrior: '01/10/2021',
        isinCode: 'BRMGLUACNOR2',
      },
      {
        label: 'GRUPAMENTO',
        factor: '0,10000000000',
        lastDatePrior: '24/05/2024',
        approvedOn: '18/04/2024',
        isinCode: 'BRMGLUACNOR2',
      },
    ],
  },
];

describe('leitor dos eventos da B3 (SPEC-042)', () => {
  it('lê desdobramento, grupamento e bonificação; ignora cisão; junta as linhas repetidas (CA02)', () => {
    const { events, warnings } = parseB3Events(mglu);
    expect(events).toEqual([
      {
        kind: 'desdobramento',
        exDate: '2020-10-13',
        factor: '300',
        approvedOn: '2020-09-22',
        isin: 'BRMGLUACNOR2',
      },
      {
        kind: 'grupamento',
        exDate: '2024-05-24',
        factor: '0.1',
        approvedOn: '2024-04-18',
        isin: 'BRMGLUACNOR2',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('fator com ponto de milhar (desdobramento de 1 para 100, como a AGRO em 2007)', () => {
    const { events, warnings } = parseB3Events([
      {
        stockDividends: [
          {
            label: 'DESDOBRAMENTO',
            factor: '9.900,00000000000',
            lastDatePrior: '31/10/2007',
            isinCode: 'BRAGROACNOR7',
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
    expect(events[0]?.factor).toBe('9900');
  });

  it('linha estranha vira aviso; resposta sem eventos, nenhum', () => {
    expect(
      parseB3Events([
        {
          stockDividends: [
            { label: 'BONIFICACAO', factor: 'x', lastDatePrior: '01/01/2025', isinCode: 'BRX' },
          ],
        },
      ]).warnings,
    ).toHaveLength(1);
    expect(parseB3Events(null)).toEqual({ events: [], warnings: [] });
  });
});

describe('coleta dos eventos da B3 (SPEC-042)', () => {
  let source: FakeB3CompanySource;
  let trades: InMemoryB3Trades;
  let events: InMemoryEvents;
  let runs: InMemoryTaskRuns;
  const assets = new InMemoryFundamentals([
    { id: 'a-mglu3', ticker: 'MGLU3', assetClass: 'stock' },
    { id: 'a-mxrf11', ticker: 'MXRF11', assetClass: 'fii' },
  ]);

  beforeEach(async () => {
    source = new FakeB3CompanySource();
    trades = new InMemoryB3Trades();
    events = new InMemoryEvents();
    runs = new InMemoryTaskRuns();
    source.companies.set('MGLU', mglu);
    await trades.record(
      [
        {
          ticker: 'MGLU3',
          assetClass: 'stock',
          lastTradingDay: '2026-11-03',
          isin: 'BRMGLUACNOR2',
        },
      ],
      new Date(),
    );
  });

  const collection = () =>
    new B3EventsCollection({
      source,
      assets,
      trades,
      events,
      runs,
      sleep: vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(),
      clock: () => new Date('2026-11-08T07:00:00Z'),
    });

  it('uma consulta por empresa (só ações) e os eventos vão para o ativo do mesmo ISIN (CA02)', async () => {
    const result = await collection().run();
    expect(source.requests).toEqual(['MGLU']);
    expect(result).toMatchObject({ status: 'sucesso', records: 2, affectedAssets: 1 });
    expect(await events.forAsset('a-mglu3')).toEqual([
      { kind: 'desdobramento', exDate: '2020-10-13', factor: '300' },
      { kind: 'grupamento', exDate: '2024-05-24', factor: '0.1' },
    ]);
  });

  it('sem nenhum ISIN ainda (antes da próxima leitura dos arquivos da B3): espera, sem execução', async () => {
    trades = new InMemoryB3Trades();
    expect(await collection().run()).toBeNull();
    expect(runs.runs).toEqual([]);
  });
});
