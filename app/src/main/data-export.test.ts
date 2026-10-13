import { join } from 'node:path';
import type { PersonalDataExport } from '@simulador/shared';
import { describe, expect, it, vi } from 'vitest';
import { saveDataExport, type SaveTarget } from './data-export.js';

const data = {
  format: 'simulador-investimentos/dados-pessoais',
  version: 1,
  exportedAt: '2026-10-13T15:00:00.000Z',
  account: { email: 'ana@exemplo.com' },
} as unknown as PersonalDataExport;

function target(chosen: string | null): SaveTarget & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    chooseFile: vi.fn(async () => chosen),
    writeFile: async (path, contents) => {
      files.set(path, contents);
    },
  };
}

describe('Baixar meus dados (SPEC-034 CA02)', () => {
  it('sugere o nome com a data e salva o JSON onde a pessoa escolheu', async () => {
    const save = target('C:/escolhido/meus-dados.json');
    const result = await saveDataExport(async () => ({ ok: true, data }), save, 'C:/Downloads');
    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(save.chooseFile).toHaveBeenCalledWith(
      join('C:/Downloads', 'simulador-meus-dados-2026-10-13.json'),
    );
    expect(JSON.parse(save.files.get('C:/escolhido/meus-dados.json') ?? '')).toEqual(data);
  });

  it('cancelar a janela não salva nada', async () => {
    const save = target(null);
    await expect(
      saveDataExport(async () => ({ ok: true, data }), save, 'C:/Downloads'),
    ).resolves.toEqual({ ok: true, data: { saved: false } });
    expect(save.files.size).toBe(0);
  });

  it('erro do servidor chega para a tela, sem abrir a janela', async () => {
    const save = target('x.json');
    await expect(
      saveDataExport(
        async () => ({ ok: false, error: 'server_unavailable' }),
        save,
        'C:/Downloads',
      ),
    ).resolves.toEqual({ ok: false, error: 'server_unavailable' });
    expect(save.chooseFile).not.toHaveBeenCalled();
  });
});
