import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cotahistFile, zipSingleFile } from '../testing/cotahist-fixtures.js';
import { B3CotahistSource } from './b3-cotahist-source.js';

const quote = {
  date: '20251230',
  ticker: 'PETR4',
  open: 3000,
  high: 3100,
  low: 2950,
  average: 3050,
  close: 3080,
};

async function collect(lines: AsyncIterable<string> | null): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines ?? []) out.push(line);
  return out;
}

/** Respostas da "B3" por nome de arquivo; o resto é 404. */
function fakeB3(files: Record<string, Buffer | { status: number; body?: string }>) {
  return vi.fn<typeof fetch>((input) => {
    const name = String(input).split('/').pop() ?? '';
    const file = files[name];
    if (!file) return Promise.resolve(new Response('não encontrado', { status: 404 }));
    if (Buffer.isBuffer(file)) return Promise.resolve(new Response(new Uint8Array(file)));
    return Promise.resolve(new Response(file.body ?? '', { status: file.status }));
  });
}

describe('adaptador dos arquivos da B3', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'b3-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('baixa o anual, descompacta e devolve as linhas do arquivo', async () => {
    const zip = zipSingleFile('COTAHIST_A2025.TXT', cotahistFile([quote, quote]));
    const fetch = fakeB3({ 'COTAHIST_A2025.ZIP': zip });
    const source = new B3CotahistSource({ cacheDir, fetch, baseUrl: 'https://b3.test' });

    const lines = await collect(await source.annual(2025, true));
    expect(lines).toHaveLength(4); // cabeçalho, 2 cotações e rodapé
    expect(lines[1]?.slice(12, 24).trim()).toBe('PETR4');
    expect(fetch).toHaveBeenCalledWith('https://b3.test/COTAHIST_A2025.ZIP', expect.anything());
  });

  it('ano fechado é baixado uma vez só e reaproveitado (CA09)', async () => {
    const fetch = fakeB3({
      'COTAHIST_A2024.ZIP': zipSingleFile('COTAHIST_A2024.TXT', cotahistFile([quote])),
    });
    const source = new B3CotahistSource({ cacheDir, fetch });
    await collect(await source.annual(2024, true));
    const again = await collect(await source.annual(2024, true));
    expect(again).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readdirSync(cacheDir)).toEqual(['COTAHIST_A2024.ZIP']);
  });

  it('ano em andamento e arquivo diário não ficam guardados', async () => {
    const fetch = fakeB3({
      'COTAHIST_A2026.ZIP': zipSingleFile('COTAHIST_A2026.TXT', cotahistFile([quote])),
      'COTAHIST_D28102026.ZIP': zipSingleFile('COTAHIST_D28102026.TXT', cotahistFile([quote])),
    });
    const source = new B3CotahistSource({ cacheDir, fetch });
    expect(await collect(await source.annual(2026, false))).toHaveLength(3);
    expect(await collect(await source.daily('2026-10-28'))).toHaveLength(3);
    await collect(await source.annual(2026, false));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('leitura interrompida no meio também apaga o arquivo temporário', async () => {
    const fetch = fakeB3({
      'COTAHIST_D28102026.ZIP': zipSingleFile('X.TXT', cotahistFile([quote, quote, quote])),
    });
    const source = new B3CotahistSource({ cacheDir, fetch });
    const lines = await source.daily('2026-10-28');
    for await (const line of lines ?? []) {
      expect(line).toBeTruthy();
      break;
    }
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('arquivo ainda não publicado (404) devolve null, sem erro', async () => {
    const source = new B3CotahistSource({ cacheDir, fetch: fakeB3({}) });
    expect(await source.daily('2026-10-29')).toBeNull();
    expect(await source.annual(2015, true)).toBeNull();
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('B3 fora do ar ou resposta que não é ZIP viram erro e não deixam arquivo pela metade', async () => {
    const source = new B3CotahistSource({
      cacheDir,
      fetch: fakeB3({
        'COTAHIST_A2023.ZIP': { status: 503 },
        'COTAHIST_A2022.ZIP': { status: 200, body: '<html>manutenção</html>' },
      }),
    });
    await expect(source.annual(2023, true)).rejects.toThrow(/503/);
    await expect(source.annual(2022, true)).rejects.toThrow(/não é um ZIP/);
    expect(readdirSync(cacheDir)).toEqual([]);
    expect(existsSync(join(cacheDir, 'COTAHIST_A2022.ZIP'))).toBe(false);
  });
});
