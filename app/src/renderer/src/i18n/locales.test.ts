import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function placeholders(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') result[path] = (v.match(/\{\{\w+\}\}/g) ?? []).sort();
    else if (typeof v === 'object' && v !== null)
      for (const [k, child] of Object.entries(v)) walk(child, path ? `${path}.${k}` : k);
  };
  walk(value, '');
  return result;
}

describe('arquivos de idioma (CA13)', () => {
  it('português e inglês têm exatamente as mesmas chaves', () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
  });

  it('usam as mesmas variáveis de interpolação', () => {
    expect(placeholders(en)).toEqual(placeholders(ptBR));
  });

  it('não têm textos vazios', () => {
    for (const text of Object.values(placeholders(ptBR))) expect(text).toBeDefined();
    const empty = (v: unknown): boolean =>
      typeof v === 'string' ? v.trim() === '' : Object.values(v as object).some(empty);
    expect(empty(ptBR)).toBe(false);
    expect(empty(en)).toBe(false);
  });
});
