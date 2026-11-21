import { describe, expect, it } from 'vitest';
import {
  SENTIMENT_THRESHOLD,
  classifySentiment,
  sentimentFromScore,
  sentimentWords,
} from './sentiment-lexicon.js';

const title = (text: string) => classifySentiment({ title: text, summary: null });

describe('sentimento por dicionário (SPEC-044 §4.1, decisão 1)', () => {
  it('lê sem acento, sem maiúscula, com o hífen separando e sem números', () => {
    expect(sentimentWords('Prejuízo de R$ 164,5 mi; UBS corta preço-alvo')).toEqual([
      'prejuizo',
      'de',
      'r',
      'mi',
      'ubs',
      'corta',
      'preco',
      'alvo',
    ]);
  });

  it('classifica os exemplos claros do §4.3', () => {
    expect(
      title('Lucro da Prio (PRIO3) explode 707% com produção recorde e Brent mais caro'),
    ).toMatchObject({ sentiment: 'positive' });
    expect(
      title('Petrobras (PETR4) pagará dividendos de R$ 15,3 bilhões; veja condições').sentiment,
    ).toBe('positive');
    expect(title('Balanço fraco e redução de payout derrubam ações do BB (BBAS3)').sentiment).toBe(
      'negative',
    );
    expect(
      title('Marcopolo (POMO4) vê lucro cair 43% e chegar a R$ 186,5 mi no 3T26').sentiment,
    ).toBe('negative');
    expect(title('Embraer (EMBJ3) vai desdobrar papeis listados em Nova York').sentiment).toBe(
      'neutral',
    );
  });

  it('procura primeiro os termos de mais palavras', () => {
    // "reduz prejuízo" é bom, "prejuízo" sozinho é ruim.
    expect(title('Raízen (RAIZ55) reduz prejuízo no trimestre').sentiment).toBe('positive');
    expect(title('Azul (AZUL3) registra prejuízo no 3T26').sentiment).toBe('negative');
    // "recuperação" é bom; "recuperação judicial" é ruim.
    expect(title('Escritórios mostram recuperação').sentiment).toBe('positive');
    expect(title('Casas Bahia em recuperação judicial').sentiment).toBe('negative');
  });

  it('inverte o termo até 3 palavras depois de "não"', () => {
    expect(title('Ações sobem').sentiment).toBe('positive');
    expect(title('Ações não sobem').sentiment).toBe('negative');
    expect(title('Ações não devem mais uma vez subir... sobem').sentiment).toBe('positive');
  });

  it('dá mais peso ao que vem depois de "mas"', () => {
    expect(title('Lucro do BTG bate novo recorde, mas ações caem na B3').sentiment).toBe(
      'negative',
    );
  });

  it('intensifica o termo depois de "forte"', () => {
    const plain = title('Ações operam em queda').score;
    const strong = title('Ações operam em forte queda').score;
    expect(strong).toBeLessThan(plain);
  });

  it('o título pesa o dobro do resumo', () => {
    const inTitle = classifySentiment({ title: 'Ações sobem', summary: null }).score;
    const inSummary = classifySentiment({ title: 'Notícia', summary: 'Ações sobem' }).score;
    expect(inTitle).toBeGreaterThan(inSummary);
    expect(inSummary).toBeGreaterThan(SENTIMENT_THRESHOLD);
  });

  it('termos bons e ruins na mesma medida dão neutro', () => {
    expect(title('Ações sobem e dólar cai').sentiment).toBe('neutral');
  });

  it('pontuação entre −1 e 1, neutra dentro da faixa', () => {
    const score = classifySentiment({
      title: 'Lucro explode, dispara, salta e bate recorde',
      summary: 'Dividendos e recompra',
    }).score;
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0.8);
    expect(sentimentFromScore(SENTIMENT_THRESHOLD)).toBe('neutral');
    expect(sentimentFromScore(-SENTIMENT_THRESHOLD)).toBe('neutral');
    expect(sentimentFromScore(0.21)).toBe('positive');
    expect(sentimentFromScore(-0.21)).toBe('negative');
  });
});
