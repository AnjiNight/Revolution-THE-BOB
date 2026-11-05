import { describe, expect, it, vi } from 'vitest';
import { B3CompanyHttpSource } from './b3-company-source.js';

const company = [{ code: 'MGLU', stockDividends: [] }];

describe('adaptador da página da empresa na B3 (SPEC-042)', () => {
  it('pede o código em base64 e lê o JSON que a B3 manda dentro de uma string', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(JSON.stringify(company)), { status: 200 })),
    );
    const source = new B3CompanyHttpSource({ baseUrl: 'http://b3.test', fetch });

    expect(await source.company('MGLU')).toEqual(company);
    const url = String(fetch.mock.calls[0]?.[0]);
    const params = url.split('/').at(-1) as string;
    expect(JSON.parse(Buffer.from(params, 'base64').toString('utf8'))).toEqual({
      issuingCompany: 'MGLU',
      language: 'pt-br',
    });
  });

  it('JSON comum também serve; vazio é "não conhece"; erro do servidor lança', async () => {
    const answer = (body: string, status = 200) =>
      new B3CompanyHttpSource({
        fetch: () => Promise.resolve(new Response(body, { status })),
      }).company('MGLU');
    expect(await answer(JSON.stringify(company))).toEqual(company);
    expect(await answer('')).toBeNull();
    await expect(answer('', 503)).rejects.toThrow('503');
    await expect(answer('<html>')).rejects.toThrow('não é JSON');
  });
});
