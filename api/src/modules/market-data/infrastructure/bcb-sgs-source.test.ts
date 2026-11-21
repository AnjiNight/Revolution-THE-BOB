import { describe, expect, it, vi } from 'vitest';
import { IndexSourceError } from '../application/ports.js';
import { BcbSgsSource } from './bcb-sgs-source.js';

/** `fetch` falso que devolve sempre a mesma resposta e guarda os endereços pedidos. */
function fakeFetch(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(() => Promise.resolve(response()));
}

describe('adaptador do SGS do Banco Central (SPEC-007)', () => {
  it('monta a consulta com as datas em dd/mm/aaaa e devolve as linhas (CA01)', async () => {
    const fetch = fakeFetch(() =>
      Response.json([{ data: '03/11/2026', valor: '0.050788' }], { status: 200 }),
    );
    const source = new BcbSgsSource({ baseUrl: 'http://bcb.test/', fetch });

    expect(await source.series(12, '2026-10-27', '2026-11-04')).toEqual([
      { data: '03/11/2026', valor: '0.050788' },
    ]);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'http://bcb.test/dados/serie/bcdata.sgs.12/dados?formato=json' +
        '&dataInicial=27%2F10%2F2026&dataFinal=04%2F11%2F2026',
    );
  });

  it('404 é "nada publicado no intervalo", não erro', async () => {
    const source = new BcbSgsSource({ fetch: fakeFetch(() => new Response('', { status: 404 })) });
    expect(await source.series(12, '2026-11-04', '2026-11-04')).toBeNull();
  });

  it('cada falha vira um erro distinto: o que vale tentar de novo e o que não', async () => {
    const kindOf = async (response: () => Response | Promise<Response>) => {
      const source = new BcbSgsSource({ fetch: fakeFetch(response) });
      try {
        await source.series(12, '2015-01-01', '2026-11-04');
        return 'sem erro';
      } catch (error) {
        return error instanceof IndexSourceError ? error.kind : 'outro';
      }
    };
    expect(await kindOf(() => new Response('', { status: 503 }))).toBe('retryable');
    expect(await kindOf(() => new Response('', { status: 429 }))).toBe('retryable');
    expect(await kindOf(() => Promise.reject(new TypeError('fetch failed')))).toBe('retryable');
    expect(await kindOf(() => new Response('janela maior que 10 anos', { status: 406 }))).toBe(
      'rejected',
    );
    expect(await kindOf(() => new Response('<html>', { status: 200 }))).toBe('bad_response');
    expect(await kindOf(() => Response.json({ erro: 'x' }, { status: 200 }))).toBe('bad_response');
  });
});
