import { describe, expect, it } from 'vitest';
import {
  findOriginal,
  normalizeUrl,
  sameTitle,
  titleSimilarity,
  titleWords,
  type DuplicateCandidate,
} from './duplicates.js';

const news = (fields: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  id: 'n1',
  sourceId: 'valor',
  url: 'https://valor.globo.com/financas/noticia/2026/11/21/selic.ghtml',
  title: 'Copom mantém a Selic em 15% ao ano pela terceira reunião seguida',
  publishedAt: new Date('2026-11-21T12:00:00Z'),
  ...fields,
});

describe('normalizeUrl (SPEC-047)', () => {
  it('tira parâmetros, âncora, www, a barra do fim e as maiúsculas do domínio', () => {
    expect(normalizeUrl('https://WWW.InfoMoney.com.br/mercados/petr4/?utm_source=rss#topo')).toBe(
      'infomoney.com.br/mercados/petr4',
    );
    expect(normalizeUrl('http://infomoney.com.br/mercados/petr4')).toBe(
      'infomoney.com.br/mercados/petr4',
    );
  });

  it('endereço inválido fica como veio, em minúsculas', () => {
    expect(normalizeUrl(' Não É Endereço ')).toBe('não é endereço');
  });
});

describe('título (SPEC-047)', () => {
  it('sem acento, pontuação, palavras curtas e o " - Veículo" do fim', () => {
    expect([...titleWords('Petrobras (PETR4) sobe 3% após anúncio - InfoMoney')]).toEqual([
      'petrobras',
      'petr4',
      'sobe',
      'apos',
      'anuncio',
    ]);
  });

  it('o mesmo título republicado é repetido; o mesmo assunto em outra matéria não', () => {
    expect(
      sameTitle(
        'Diretor da Clene Inc. compra US$ 34.240 em ações da empresa - Investing.com Brasil',
        'Diretor da Clene Inc. compra US$ 34.240 em ações da empresa',
      ),
    ).toBe(true);
    // Medido em 21/11/2026: Exame × Valor, 64% das palavras.
    const exame = "México prende 'Chapo Isidro', um dos dez fugitivos mais buscados pelo FBI";
    const valor =
      "México captura narcotraficante 'El Chapo Isidro', um dos dez fugitivos mais procurados pelo FBI";
    expect(titleSimilarity(exame, valor)).toBeLessThan(0.8);
    expect(sameTitle(exame, valor)).toBe(false);
  });

  it('títulos curtos só valem se forem iguais', () => {
    expect(sameTitle('Ibovespa sobe', 'Ibovespa sobe')).toBe(true);
    expect(sameTitle('Ibovespa sobe forte', 'Ibovespa sobe pouco')).toBe(false);
  });
});

describe('findOriginal (SPEC-047)', () => {
  const original = news({
    id: 'o1',
    sourceId: 'agencia',
    url: 'https://agenciabrasil.ebc.com.br/economia/noticia/2026-11/copom-selic',
    publishedAt: new Date('2026-11-21T10:00:00Z'),
  });

  it('pelo mesmo endereço, antes do título', () => {
    const copy = news({
      url: 'https://www.valor.globo.com/financas/noticia/2026/11/21/selic.ghtml?utm=rss',
      title: 'Outro título',
    });
    const sameUrl = news({ id: 'o2', sourceId: 'exame', title: 'Bem diferente' });
    expect(findOriginal(copy, [original, sameUrl])).toEqual({
      original: sameUrl,
      reason: 'endereco',
    });
  });

  it('pelo título quase igual, na ordem das candidatas', () => {
    const copy = news({ url: 'https://exame.com/selic', sourceId: 'exame' });
    expect(findOriginal(copy, [original])).toEqual({ original, reason: 'titulo' });
  });

  it('a mesma fonte, fora das 48 horas ou a própria notícia não contam', () => {
    expect(findOriginal(news({ sourceId: 'agencia' }), [original])).toBeNull();
    expect(
      findOriginal(news({ publishedAt: new Date('2026-11-23T10:00:01Z') }), [original]),
    ).toBeNull();
    expect(findOriginal(original, [original])).toBeNull();
  });
});
