import type { AssetHistory } from '@simulador/shared';

/**
 * Situação do histórico de um ativo para a tela do colaborador (SPEC-008 §5.3): com cotações,
 * `loaded`; sem cotações e com todos os anos publicados já lidos, `not_found` (o ticker não
 * apareceu nos arquivos da B3); senão, `pending`.
 */
export function historyStatus(
  range: { from: string; to: string } | undefined,
  loadedYears: ReadonlySet<number> | undefined,
  publishedYears: readonly number[],
): AssetHistory {
  if (range) return { status: 'loaded', from: range.from, to: range.to };
  const allRead =
    publishedYears.length > 0 && publishedYears.every((year) => loadedYears?.has(year) === true);
  return { status: allRead ? 'not_found' : 'pending', from: null, to: null };
}
