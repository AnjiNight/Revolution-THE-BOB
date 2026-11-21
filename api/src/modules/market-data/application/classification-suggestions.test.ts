import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryClassifications } from '../testing/fakes.js';
import { ClassificationSuggestions } from './classification-suggestions.js';

const at = new Date('2026-11-09T07:00:00Z');

describe('classificação sugerida pelas fontes melhores (SPEC-021 §4.1, decisão 5)', () => {
  let classifications: InMemoryClassifications;

  beforeEach(() => {
    classifications = new InMemoryClassifications();
    const b3 = (code: string, sector: string) =>
      classifications.b3.set(code, {
        code,
        codeCvm: '1',
        sector,
        subsector: null,
        segment: null,
        collectedAt: at,
      });
    b3('ALPA', 'Consumo Cíclico');
    b3('ITUB', 'Financeiro');
    b3('XPTO', 'Outros');
    const asset = (
      id: string,
      assetClass: 'stock' | 'fii',
      sector: string,
      reviewed = false,
      fund: [string, string] | null = null,
    ) =>
      classifications.assets.push({
        id,
        ticker: id,
        assetClass,
        sector: sector as never,
        reviewed,
        fundType: fund?.[0] ?? null,
        fundSegment: fund?.[1] ?? null,
      });
    asset('ALPA4', 'stock', 'outros');
    // Conferido pela equipe: a B3 diz Financeiro, mas a equipe decidiu outra coisa.
    asset('ITUB4', 'stock', 'outros', true);
    asset('XPTO3', 'stock', 'saude');
    asset('HGLG11', 'fii', 'outros', false, ['Fundo de Tijolo', 'Logístico / Indústria / Galpões']);
    asset('MXRF11', 'fii', 'logistica', false, ['Fundo de Papel', 'Híbrido']);
    asset('VIUR11', 'fii', 'residencial', false, ['Fundo de Tijolo', 'Outros']);
    asset('SEMI11', 'fii', 'outros');
  });

  const suggestions = (investidor10Enabled = true) =>
    new ClassificationSuggestions({ classifications, investidor10Enabled, clock: () => at });

  it('troca só os a revisar, só por setor específico, com a fonte na auditoria (CA03 a CA05)', async () => {
    const result = await suggestions().apply();
    expect(result).toMatchObject({ stocks: 1, fiis: 2 });
    const sectors = Object.fromEntries(
      classifications.assets.map((asset) => [asset.ticker, asset.sector]),
    );
    expect(sectors).toEqual({
      ALPA4: 'consumo_ciclico',
      ITUB4: 'outros',
      XPTO3: 'saude',
      HGLG11: 'logistica',
      MXRF11: 'hibrido',
      VIUR11: 'residencial',
      SEMI11: 'outros',
    });
    expect(classifications.audit).toEqual([
      {
        assetId: 'ALPA4',
        ticker: 'ALPA4',
        from: 'outros',
        to: 'consumo_ciclico',
        source: 'b3',
        at,
      },
      {
        assetId: 'HGLG11',
        ticker: 'HGLG11',
        from: 'outros',
        to: 'logistica',
        source: 'investidor10',
        at,
      },
      {
        assetId: 'MXRF11',
        ticker: 'MXRF11',
        from: 'logistica',
        to: 'hibrido',
        source: 'investidor10',
        at,
      },
    ]);
  });

  it('rodar de novo não muda nada', async () => {
    await suggestions().apply();
    expect(await suggestions().apply()).toMatchObject({ stocks: 0, fiis: 0, changes: [] });
  });

  it('Investidor10 desligado: os FIIs não mudam; as ações, sim', async () => {
    expect(await suggestions(false).apply()).toMatchObject({ stocks: 1, fiis: 0 });
    expect(classifications.assets.find((asset) => asset.id === 'HGLG11')?.sector).toBe('outros');
  });
});
