import { describe, expect, it } from 'vitest';
import { BrapiLogoSource, LogoRejectedError, MAX_LOGO_BYTES } from './brapi-logo-source.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

type Body = ConstructorParameters<typeof Response>[0];

function fakeFetch(body: Body, init: ResponseInit = {}) {
  const urls: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    urls.push(String(input));
    return Promise.resolve(new Response(body, init));
  };
  return { fetchFn, urls };
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LogoRejectedError) return error.message;
    throw error;
  }
  throw new Error('esperava LogoRejectedError');
}

describe('logos da brapi (SPEC-040 CA07)', () => {
  it('baixa SVG e PNG do servidor de ícones da brapi', async () => {
    const svg = fakeFetch(SVG, { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } });
    const image = await new BrapiLogoSource({ fetch: svg.fetchFn }).download(
      'https://icons.brapi.dev/icons/PETR4.svg',
    );
    expect(image.type).toBe('image/svg+xml');
    expect(new TextDecoder().decode(image.content)).toBe(SVG);
    expect(svg.urls).toEqual(['https://icons.brapi.dev/icons/PETR4.svg']);

    const png = fakeFetch(PNG, { headers: { 'content-type': 'image/png' } });
    expect(
      (await new BrapiLogoSource({ fetch: png.fetchFn }).download('https://icons.brapi.dev/x.png'))
        .type,
    ).toBe('image/png');
  });

  it('só do servidor de ícones da brapi, e só por HTTPS', async () => {
    const { fetchFn, urls } = fakeFetch(SVG, { headers: { 'content-type': 'image/svg+xml' } });
    const logos = new BrapiLogoSource({ fetch: fetchFn });
    expect(await rejection(logos.download('https://outro.site/PETR4.svg'))).toMatch(
      /outro servidor/,
    );
    expect(await rejection(logos.download('http://icons.brapi.dev/PETR4.svg'))).toMatch(/HTTPS/);
    expect(await rejection(logos.download('javascript:alert(1)'))).toMatch(/HTTPS/);
    expect(await rejection(logos.download('não é endereço'))).toMatch(/inválido/);
    expect(urls).toEqual([]); // nada foi pedido a ninguém
  });

  it('recusa outro tipo, conteúdo que não confere e arquivo grande demais', async () => {
    const url = 'https://icons.brapi.dev/icons/PETR4.svg';
    const download = (body: Body, headers: Record<string, string>) =>
      new BrapiLogoSource({ fetch: fakeFetch(body, { headers }).fetchFn }).download(url);

    expect(await rejection(download('<html>', { 'content-type': 'text/html' }))).toMatch(/tipo/);
    expect(await rejection(download('não é svg', { 'content-type': 'image/svg+xml' }))).toMatch(
      /conteúdo/,
    );
    expect(await rejection(download(SVG, { 'content-type': 'image/png' }))).toMatch(/conteúdo/);
    const big = `<svg>${'x'.repeat(MAX_LOGO_BYTES)}</svg>`;
    expect(await rejection(download(big, { 'content-type': 'image/svg+xml' }))).toMatch(/máximo/);
    expect(
      await rejection(
        download(SVG, {
          'content-type': 'image/svg+xml',
          'content-length': String(MAX_LOGO_BYTES + 1),
        }),
      ),
    ).toMatch(/máximo/);
  });

  it('erro do servidor ou da rede vira recusa, com o motivo', async () => {
    const notFound = new BrapiLogoSource({ fetch: fakeFetch('x', { status: 404 }).fetchFn });
    expect(await rejection(notFound.download('https://icons.brapi.dev/a.svg'))).toMatch(/404/);

    const offline = new BrapiLogoSource({ fetch: () => Promise.reject(new Error('sem rede')) });
    expect(await rejection(offline.download('https://icons.brapi.dev/a.svg'))).toMatch(/sem rede/);
  });

  it('o servidor falso dos testes pode ser liberado por configuração', async () => {
    const { fetchFn } = fakeFetch(SVG, { headers: { 'content-type': 'image/svg+xml' } });
    const local = new BrapiLogoSource({
      fetch: fetchFn,
      hosts: ['127.0.0.1:4399'],
      allowHttp: true,
    });
    expect((await local.download('http://127.0.0.1:4399/icons/A.svg')).type).toBe('image/svg+xml');
  });
});
