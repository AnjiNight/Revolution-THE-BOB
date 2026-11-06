import { join } from 'node:path';
import type { PersonalDataExport } from '@simulador/shared';
import type { ClientResult } from '../shared/auth-ipc.js';

/** Onde e como salvar o arquivo. No app, a janela "Salvar como" do Electron e o disco. */
export interface SaveTarget {
  /** Devolve o caminho escolhido, ou null se a pessoa cancelou. */
  chooseFile(defaultPath: string): Promise<string | null>;
  writeFile(path: string, contents: string): Promise<void>;
}

/**
 * "Baixar meus dados" (SPEC-034): pede o arquivo ao servidor e salva onde a pessoa escolher.
 * O arquivo vai direto para o computador dela: nada passa por e-mail nem por link.
 */
export async function saveDataExport(
  fetchExport: () => Promise<ClientResult<PersonalDataExport>>,
  target: SaveTarget,
  downloadsDir: string,
): Promise<ClientResult<{ saved: boolean }>> {
  const result = await fetchExport();
  if (!result.ok) return result;

  const day = result.data.exportedAt.slice(0, 10);
  const path = await target.chooseFile(join(downloadsDir, `simulador-meus-dados-${day}.json`));
  if (!path) return { ok: true, data: { saved: false } };

  try {
    await target.writeFile(path, `${JSON.stringify(result.data, null, 2)}\n`);
  } catch {
    return { ok: false, error: 'unexpected' };
  }
  return { ok: true, data: { saved: true } };
}
