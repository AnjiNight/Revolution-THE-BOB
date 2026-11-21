import { afterEach, describe, expect, it, vi } from 'vitest';

// O i18next de verdade não é preciso: só o que o módulo de idioma chama.
const i18nMock = vi.hoisted(() => {
  const mock = {
    language: 'pt-BR',
    use: () => ({ init: () => Promise.resolve() }),
    on: () => undefined,
    t: (key: string) => key,
    changeLanguage: async (language: string) => {
      mock.language = language;
    },
  };
  return mock;
});
vi.mock('i18next', () => ({ default: i18nMock }));
vi.mock('react-i18next', () => ({ initReactI18next: {} }));

const { changeLanguage, currentLanguage, LANGUAGE_STORAGE_KEY, pickLanguage } =
  await import('./index.js');

afterEach(() => {
  vi.unstubAllGlobals();
  i18nMock.language = 'pt-BR';
});

describe('pickLanguage', () => {
  it.each([
    ['en-US', 'en'],
    ['en', 'en'],
    ['pt-BR', 'pt-BR'],
    ['es-ES', 'pt-BR'],
    [undefined, 'pt-BR'],
  ])('sem escolha guardada, o sistema decide: %s → %s', (system, expected) => {
    expect(pickLanguage(null, system)).toBe(expected);
  });

  it('a escolha guardada neste computador vale mais que o sistema (SPEC-035 CA03)', () => {
    expect(pickLanguage('en', 'pt-BR')).toBe('en');
    expect(pickLanguage('pt-BR', 'en-US')).toBe('pt-BR');
  });

  it('um valor guardado estranho é ignorado (SPEC-035 CA03)', () => {
    expect(pickLanguage('fr', 'en-US')).toBe('en');
    expect(pickLanguage('EN', 'pt-BR')).toBe('pt-BR');
    expect(pickLanguage('', undefined)).toBe('pt-BR');
  });
});

describe('changeLanguage (SPEC-035)', () => {
  it('troca o idioma e guarda a escolha neste computador (CA02, CA03)', async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    await changeLanguage('en');
    expect(currentLanguage()).toBe('en');
    expect(saved.get(LANGUAGE_STORAGE_KEY)).toBe('en');
    await changeLanguage('pt-BR');
    expect(currentLanguage()).toBe('pt-BR');
    expect(saved.get(LANGUAGE_STORAGE_KEY)).toBe('pt-BR');
  });

  it('sem armazenamento, a troca vale do mesmo jeito (até fechar o app) (CA03)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('armazenamento bloqueado');
      },
    });
    await expect(changeLanguage('en')).resolves.toBeUndefined();
    expect(currentLanguage()).toBe('en');
  });
});
