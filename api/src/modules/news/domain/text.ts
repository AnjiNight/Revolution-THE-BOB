/**
 * Texto puro a partir do que as fontes mandam (SPEC-027 §4.2): nada de HTML nem de script é
 * guardado. Só as entidades comuns são traduzidas; o resto vira o próprio texto.
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  ordm: 'º',
  ordf: 'ª',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const value =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

/** HTML → texto: tira scripts, estilos e marcas, traduz as entidades e junta os espaços. */
export function htmlToText(html: string): string {
  const withoutCode = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = decodeEntities(
    withoutCode.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '),
  );
  // Entidade que escondia uma marca (&lt;p&gt; no RSS) vira marca depois de traduzida.
  const again = /<[a-z/!][^>]*>/i.test(text) ? text.replace(/<[^>]*>/g, ' ') : text;
  return again
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Corta no limite sem partir uma palavra no meio, com "…" no fim. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Endereço sem `#` e sem parâmetros de campanha: a chave da notícia (§4.2). */
export function canonicalUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Data de uma fonte (ISO 8601 ou a do RSS, "Thu, 12 Nov 2026 17:03:25 -0300"), ou `null`. */
export function parseSourceDate(text: string | null | undefined): Date | null {
  if (!text) return null;
  const date = new Date(text.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}
