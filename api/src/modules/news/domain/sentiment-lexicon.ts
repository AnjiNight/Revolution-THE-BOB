import type { NewsSentiment } from '@simulador/shared';

/**
 * Sentimento por regras com dicionário (SPEC-044 §4.1, decisão 1): o tom da notícia pelos termos
 * do mercado no título (peso 2) e no resumo (peso 1). Puro (DA10): nada de banco nem de rede.
 */

export const LEXICON_MODEL = { name: 'lexico', number: 1 } as const;

/** Acima de `+THRESHOLD`, positiva; abaixo de `-THRESHOLD`, negativa; entre os dois, neutra. */
export const SENTIMENT_THRESHOLD = 0.2;

const TITLE_WEIGHT = 2;
const SUMMARY_WEIGHT = 1;
/** Termo depois de "mas" pesa mais: "lucro recorde, mas ações caem" é sobre a queda. */
const AFTER_BUT = 1.5;
const INTENSIFIED = 1.5;
/** Até quantas palavras depois de "não" o termo é invertido. */
const NEGATION_REACH = 3;
/** Quanto a soma precisa crescer para a pontuação chegar perto de 1. */
const SCALE = 2;

/**
 * Termos sem acento e em minúsculas. `*` no fim de uma palavra aceita qualquer final ("despenc*":
 * despenca, despencam, despencou). Os de mais palavras são procurados primeiro, para "reduz
 * prejuízo" não contar como "prejuízo".
 */
const TERMS: ReadonlyArray<readonly [string, number]> = [
  // Fatos bons para quem tem o ativo.
  ['lucro recorde', 2],
  ['recorde de lucro', 2],
  // Peso 2: o resumo costuma repetir "prejuízo" (−2), e a redução é o assunto.
  ['reduz prejuizo', 2],
  ['reverte prejuizo', 2],
  ['revertendo prejuizo', 2],
  ['acima do esperado', 2],
  ['acima das expectativas', 2],
  ['melhor que o esperado', 2],
  ['melhor do que o esperado', 2],
  ['supera expectativas', 2],
  ['eleva preco alvo', 1],
  ['explod*', 2],
  ['dispar*', 2],
  ['salt*', 2],
  ['lucra', 1],
  ['lucram', 1],
  ['lucrou', 1],
  ['recorde', 1],
  ['sobe', 1],
  ['sobem', 1],
  ['subiu', 1],
  ['alta', 1],
  ['altas', 1],
  ['avanc*', 1],
  ['cresc*', 1],
  ['ganh*', 1],
  ['valoriz*', 1],
  ['supera', 1],
  ['amplia', 1],
  ['melhora', 1],
  ['recupera*', 1],
  ['dividendo*', 1],
  ['jcp', 1],
  ['proventos', 1],
  ['recompra', 1],
  ['alivio', 1],
  ['otimismo', 1],
  // Fatos ruins.
  ['recuperacao judicial', -2],
  ['recuperacao extrajudicial', -2],
  ['abaixo do esperado', -2],
  ['abaixo das expectativas', -2],
  ['pior do que o esperado', -2],
  ['pior que o esperado', -2],
  ['pior do que o mercado esperava', -2],
  ['corta preco alvo', -2],
  ['reduz preco alvo', -2],
  ['reducao de payout', -1],
  ['ataque hacker', -2],
  ['despenc*', -2],
  ['desab*', -2],
  ['tomb*', -2],
  ['afund*', -2],
  ['derrub*', -2],
  ['derrocada', -2],
  ['calote', -2],
  ['prejuizo', -2],
  ['rebaix*', -2],
  ['fraude', -2],
  ['escandalo', -2],
  ['cai', -1],
  ['caem', -1],
  ['caiu', -1],
  ['cair', -1],
  ['queda', -1],
  ['quedas', -1],
  ['recua', -1],
  ['recuam', -1],
  ['recuou', -1],
  ['recuo', -1],
  ['recuavam', -1],
  ['perde', -1],
  ['perdem', -1],
  ['perdeu', -1],
  ['perda', -1],
  ['perdas', -1],
  ['baixa', -1],
  ['encolh*', -1],
  ['multa*', -1],
  ['condena*', -1],
  ['inadimpl*', -1],
  ['crise', -1],
  ['pressao', -1],
  ['pressionad*', -1],
  ['magros', -1],
  ['fraco', -1],
  ['fraca', -1],
  ['piora', -1],
  ['suspend*', -1],
  ['bloque*', -1],
  ['renuncia', -1],
  ['desaceler*', -1],
  ['incerteza*', -1],
  ['preocupacao', -1],
  ['sangria', -1],
];

const NEGATIONS = new Set(['nao', 'sem', 'nem', 'jamais']);
const INTENSIFIERS = new Set(['forte', 'fortemente', 'muito', 'expressivo', 'expressiva']);
const BUT = new Set(['mas', 'porem', 'contudo', 'entretanto']);

interface Term {
  words: readonly string[];
  weight: number;
}

const COMPILED: readonly Term[] = TERMS.map(([text, weight]) => ({
  words: text.split(' '),
  weight,
})).sort((a, b) => b.words.length - a.words.length);

function wordMatches(pattern: string, word: string): boolean {
  return pattern.endsWith('*') ? word.startsWith(pattern.slice(0, -1)) : word === pattern;
}

/** Minúsculas, sem acento; hífen vira espaço ("preço-alvo"); números e sinais saem. */
export function sentimentWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '' && !/^\d+$/.test(word));
}

/** Soma dos pesos de um trecho, com a negação, a intensidade e o "mas". */
function rawScore(text: string): number {
  const words = sentimentWords(text);
  let total = 0;
  let negatedUntil = -1;
  let boost = 1;
  let afterBut = false;
  for (let i = 0; i < words.length;) {
    const word = words[i] as string;
    if (NEGATIONS.has(word)) {
      negatedUntil = i + NEGATION_REACH;
      i += 1;
      continue;
    }
    if (INTENSIFIERS.has(word)) {
      boost = INTENSIFIED;
      i += 1;
      continue;
    }
    if (BUT.has(word)) {
      afterBut = true;
      i += 1;
      continue;
    }
    const term = COMPILED.find(
      (candidate) =>
        i + candidate.words.length <= words.length &&
        candidate.words.every((pattern, k) => wordMatches(pattern, words[i + k] as string)),
    );
    if (!term) {
      i += 1;
      continue;
    }
    let weight = term.weight * boost * (afterBut ? AFTER_BUT : 1);
    if (i <= negatedUntil) weight = -weight;
    total += weight;
    boost = 1;
    i += term.words.length;
  }
  return total;
}

export interface SentimentResult {
  sentiment: NewsSentiment;
  /** De −1 a 1. */
  score: number;
}

export function sentimentFromScore(score: number): NewsSentiment {
  if (score > SENTIMENT_THRESHOLD) return 'positive';
  if (score < -SENTIMENT_THRESHOLD) return 'negative';
  return 'neutral';
}

/** O tom da notícia pelo título e pelo resumo; o texto completo mistura outros assuntos. */
export function classifySentiment(news: {
  title: string;
  summary: string | null;
}): SentimentResult {
  const sum =
    rawScore(news.title) * TITLE_WEIGHT +
    (news.summary ? rawScore(news.summary) : 0) * SUMMARY_WEIGHT;
  const score = Math.round((sum / (Math.abs(sum) + SCALE)) * 1000) / 1000;
  return { sentiment: sentimentFromScore(score), score };
}
