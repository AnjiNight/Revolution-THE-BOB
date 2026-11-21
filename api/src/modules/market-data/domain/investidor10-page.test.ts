import { describe, expect, it } from 'vitest';
import { fiiPage, stockPage } from '../testing/investidor10-fixtures.js';
import {
  historyNumber,
  Investidor10LayoutError,
  normalizeName,
  parseBrNumber,
  parseIndicatorHistory,
  parseInvestidor10Page,
} from './investidor10-page.js';

describe('números do Investidor10 (SPEC-041 §4.3)', () => {
  it('lê o texto em português em decimal, sem ponto flutuante (CA01)', () => {
    expect(parseBrNumber('4,55')).toBe('4.55');
    expect(parseBrNumber('-0,54')).toBe('-0.54');
    expect(parseBrNumber('-23,00')).toBe('-23');
    expect(parseBrNumber('50,60%')).toBe('50.6');
    expect(parseBrNumber('R$ 9,35')).toBe('9.35');
    expect(parseBrNumber('R$ 5,30 Bilhões')).toBe('5300000000');
    expect(parseBrNumber('R$ 22,26 M')).toBe('22260000');
    expect(parseBrNumber('R$ 60 mil')).toBe('60000');
    expect(parseBrNumber('1.570.590')).toBe('1570590');
    expect(parseBrNumber('0,00%')).toBe('0');
    expect(parseBrNumber('-')).toBeNull();
    expect(parseBrNumber('R$ -')).toBeNull();
    expect(parseBrNumber('-%')).toBeNull();
    expect(parseBrNumber('')).toBeNull();
    expect(() => parseBrNumber('n/d')).toThrow('não dá para ler');
  });

  it('valor do histórico (número do JSON) com até 6 casas', () => {
    expect(historyNumber(3.6069586003144)).toBe('3.606959');
    expect(historyNumber(0)).toBe('0');
    expect(historyNumber(-0.16894899794246)).toBe('-0.168949');
    expect(historyNumber('27,73')).toBe('27.73');
    expect(historyNumber(null)).toBeNull();
    expect(() => historyNumber({})).toThrow();
  });

  it('nomes iguais com e sem acento e espaço', () => {
    expect(normalizeName('Dívida Líquida / Ebitda')).toBe(normalizeName('Divida Liquida/Ebitda'));
  });
});

describe('página de ação (SPEC-041)', () => {
  const page = stockPage({
    historyId: 4,
    groups: [
      [
        'Valuation',
        [
          ['P/L', '4,55'],
          ['P/VP', '1,26'],
          ['LPA', '10,35'],
          ['Novo indicador', '1,00'],
        ],
      ],
      [
        'Eficiência',
        [
          ['Margem Ebitda', '49,83%'],
          ['Margem Líquida', '-'],
        ],
      ],
      ['Endividamento', [['Divida Liquida/Patrimônio', '0,65']]],
    ],
    dividends: [
      ['JSCP', '21/08/2026', '21/12/2026', '0,20250435'],
      ['Dividendos', '21/08/2026', '21/12/2026', '0,47156696'],
      ['Rend. Trib.', '22/04/2026', '22/06/2026', '0,02038398'],
      ['JSCP', '30/12/2025', 'Provisionado', '1,02266000'],
      ['Bonificação', '23/12/2025', '-', '3,00000000'],
      ['Desconhecido', '01/01/2026', '-', '1,00'],
      ['Dividendos', '10/01/2026', '05/01/2026', '0,10'],
    ],
  });

  it('extrai os indicadores pelo cadastro, o id do histórico e os proventos (CA01)', () => {
    const parsed = parseInvestidor10Page(page, 'stock', 'PETR4');
    expect([...parsed.current]).toEqual([
      ['p_l', '4.55'],
      ['p_vp', '1.26'],
      ['lpa', '10.35'],
      ['margem_ebitda', '49.83'],
      ['margem_liquida', null],
      ['div_liq_pl', '0.65'],
    ]);
    expect(parsed.historyId).toBe(4);
    expect(parsed.fund).toBeNull();
    expect(parsed.dividends).toEqual([
      { kind: 'jcp', exDate: '2026-08-21', paymentDate: '2026-12-21', value: '0.20250435' },
      { kind: 'dividendo', exDate: '2026-08-21', paymentDate: '2026-12-21', value: '0.47156696' },
      { kind: 'rendimento', exDate: '2026-04-22', paymentDate: '2026-06-22', value: '0.02038398' },
      // Anunciado, ainda sem data de pagamento.
      { kind: 'jcp', exDate: '2025-12-30', paymentDate: null, value: '1.02266' },
      // Pagamento antes da data com: a fonte errou, fica sem data de pagamento.
      { kind: 'dividendo', exDate: '2026-01-10', paymentDate: null, value: '0.1' },
    ]);
    // Bonificação é evento (vem da B3): pulada sem aviso; tipo desconhecido e indicador novo, avisos.
    expect(parsed.warnings).toEqual([
      'indicador fora do cadastro: "Novo indicador"',
      'provento que não dá para ler: Desconhecido | 01/01/2026 | - | 1,00',
    ]);
  });

  it('sem a tabela de indicadores (o site mudou): erro de leiaute (CA02)', () => {
    expect(() =>
      parseInvestidor10Page('<html><body>outro site</body></html>', 'stock', 'PETR4'),
    ).toThrow(Investidor10LayoutError);
  });
});

describe('página de FII (SPEC-041)', () => {
  it('extrai os cartões, as informações do fundo e os rendimentos (CA01)', () => {
    const parsed = parseInvestidor10Page(
      fiiPage({
        ticker: 'MXRF11',
        cards: [
          ['MXRF11 Cotação', 'R$ 8,40'],
          ['MXRF11 DY (12M)', '14,17%'],
          ['P/VP', '0,90'],
          ['Liquidez Diária', 'R$ 22,26 M'],
        ],
        cells: [
          ['TIPO DE FUNDO', 'Fundo de Papel'],
          ['SEGMENTO', 'Híbrido'],
          ['TAXA DE ADMINISTRAÇÃO', '0,90% a.a (mínimo de R$ 60 mil mensais)'],
          ['VACÂNCIA', '0,00%'],
          ['NUMERO DE COTISTAS', '1.570.590'],
          ['VAL. PATRIMONIAL P/ COTA', 'R$ 9,35'],
          ['VALOR PATRIMONIAL', 'R$ 5,30 Bilhões'],
        ],
        dividends: [['Dividendos', '30/10/2026', '16/11/2026', '0,09500000']],
      }),
      'fii',
      'MXRF11',
    );
    expect(Object.fromEntries(parsed.current)).toEqual({
      fii_dy_12m: '14.17',
      fii_p_vp: '0.9',
      fii_liquidez_diaria: '22260000',
      fii_vacancia: '0',
      fii_cotistas: '1570590',
      fii_vp_cota: '9.35',
      fii_valor_patrimonial: '5300000000',
    });
    expect(parsed.fund).toMatchObject({
      fundType: 'Fundo de Papel',
      segment: 'Híbrido',
      adminFee: '0,90% a.a (mínimo de R$ 60 mil mensais)',
    });
    // "Dividendos" de um FII é rendimento.
    expect(parsed.dividends).toEqual([
      { kind: 'rendimento', exDate: '2026-10-30', paymentDate: '2026-11-16', value: '0.095' },
    ]);
    expect(parsed.historyId).toBeNull();
  });

  it('FII sem as informações do fundo: erro de leiaute', () => {
    expect(() => parseInvestidor10Page(fiiPage({ ticker: 'MXRF11' }), 'fii', 'MXRF11')).toThrow(
      Investidor10LayoutError,
    );
  });
});

describe('histórico anual (SPEC-041)', () => {
  it('lê os anos de cada indicador, sem o "Atual", com os nomes do histórico', () => {
    const { rows, warnings } = parseIndicatorHistory({
      'P/L': [
        { year: 'Atual', value: '4,55' },
        { year: '2025', value: 3.6069586003144 },
        { year: '2024', value: 12.74 },
      ],
      'Margem Ebtida': [{ year: '2025', value: 46.229818570633 }],
      'Indicador Novo': [{ year: '2025', value: 1 }],
    });
    expect(
      Object.fromEntries([...rows].map(([code, years]) => [code, Object.fromEntries(years)])),
    ).toEqual({
      p_l: { '2025': '3.606959', '2024': '12.74' },
      margem_ebitda: { '2025': '46.229819' },
    });
    expect(warnings).toEqual(['indicador do histórico fora do cadastro: "Indicador Novo"']);
  });

  it('formato inesperado: erro de leiaute', () => {
    expect(() => parseIndicatorHistory([])).toThrow(Investidor10LayoutError);
  });
});
