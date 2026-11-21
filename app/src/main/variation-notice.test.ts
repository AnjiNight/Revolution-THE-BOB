import { describe, expect, it } from 'vitest';
import { isVariationNotice } from './variation-notice.js';

const PETR4 = '11111111-1111-4111-8111-111111111111';

describe('aviso de variação pedido pela interface (SPEC-033)', () => {
  it('aceita o aviso de um ativo e o agrupado', () => {
    expect(
      isVariationNotice({
        title: 'PETR4 subiu 5,2% hoje',
        body: 'R$ 38,40 às 14:30 (atraso de até 45 min) · Carteiras: Aposentadoria',
        target: { kind: 'asset', assetId: PETR4 },
      }),
    ).toBe(true);
    expect(
      isVariationNotice({
        title: '5 ativos das suas carteiras caíram 5% ou mais hoje',
        body: 'VALE3 −6,1%, PETR4 −5,4%, ITUB4 −5,1% e mais 2',
        target: { kind: 'portfolios' },
      }),
    ).toBe(true);
  });

  it('recusa o que não é um aviso: sem título, longo demais ou destino estranho', () => {
    const base = { title: 'PETR4 subiu 5,2% hoje', body: 'R$ 38,40' };
    expect(isVariationNotice(null)).toBe(false);
    expect(isVariationNotice({ ...base, title: '', target: { kind: 'portfolios' } })).toBe(false);
    expect(
      isVariationNotice({ ...base, body: 'x'.repeat(301), target: { kind: 'portfolios' } }),
    ).toBe(false);
    expect(isVariationNotice({ ...base, target: { kind: 'asset', assetId: '../../' } })).toBe(
      false,
    );
    expect(isVariationNotice({ ...base, target: { kind: 'url', href: 'https://x' } })).toBe(false);
    expect(isVariationNotice({ ...base })).toBe(false);
  });
});
