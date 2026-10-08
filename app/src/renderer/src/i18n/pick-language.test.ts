import { describe, expect, it, vi } from 'vitest';

vi.mock('i18next', () => ({ default: { use: () => ({ init: () => Promise.resolve() }) } }));
vi.mock('react-i18next', () => ({ initReactI18next: {} }));

const { pickLanguage } = await import('./index.js');

describe('pickLanguage', () => {
  it.each([
    ['en-US', 'en'],
    ['en', 'en'],
    ['pt-BR', 'pt-BR'],
    ['es-ES', 'pt-BR'],
    [undefined, 'pt-BR'],
  ])('%s → %s', (system, expected) => {
    expect(pickLanguage(system)).toBe(expected);
  });
});
