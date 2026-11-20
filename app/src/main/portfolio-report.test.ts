import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  reportFileName,
  reportFooter,
  reportPdfOptions,
  savePortfolioReport,
  type ReportTarget,
} from './portfolio-report.js';

const request = {
  portfolioName: 'Aposentadoria',
  footerNotice: 'Simulação educacional, sem recomendação de investimento',
  footerPage: 'Página {page} de {pages}',
};

function target(chosen: string | null): ReportTarget & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    chooseFile: vi.fn(async () => chosen),
    printToPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    writeFile: async (path, contents) => {
      files.set(path, contents);
    },
  };
}

describe('relatório da carteira em PDF (SPEC-038)', () => {
  it('nome sugerido: sem acentos, em minúsculas, com hífens, no idioma (CA04)', () => {
    expect(reportFileName('E se eu tivesse começado em 2019', 'pt-BR', '2026-11-17')).toBe(
      'relatorio-e-se-eu-tivesse-comecado-em-2019-2026-11-17.pdf',
    );
    expect(reportFileName('Retirement', 'en', '2026-11-17')).toBe(
      'report-retirement-2026-11-17.pdf',
    );
    // Nada que o Windows proíba no nome, nem hífens sobrando nas pontas.
    expect(reportFileName('  Ações: "BB/ITAÚ"?  ', 'pt-BR', '2026-11-17')).toBe(
      'relatorio-acoes-bb-itau-2026-11-17.pdf',
    );
    expect(reportFileName('☆☆☆', 'en', '2026-11-17')).toBe('report-portfolio-2026-11-17.pdf');
    const long = reportFileName('a'.repeat(59) + ' bc', 'pt-BR', '2026-11-17');
    expect(long).toBe(`relatorio-${'a'.repeat(59)}-2026-11-17.pdf`);
  });

  it('rodapé com o nome, o aviso e a página; o nome não vira HTML (CA03)', () => {
    const footer = reportFooter({ ...request, portfolioName: '<b>Minha & sua</b>' });
    expect(footer).toContain('&#60;b&#62;Minha &#38; sua&#60;/b&#62;');
    expect(footer).toContain(
      'Página <span class="pageNumber"></span> de <span class="totalPages"></span>',
    );
    expect(footer).toContain('font-size:8px');
    expect(reportPdfOptions(request)).toMatchObject({
      pageSize: 'A4',
      landscape: false,
      printBackground: true,
      displayHeaderFooter: true,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
    });
  });

  it('pergunta onde gravar, imprime e grava; devolve só o nome do arquivo e a pasta', async () => {
    const save = target(join('C:/Users/ana/Downloads', 'relatorio-aposentadoria-2026-11-17.pdf'));
    const { result, path } = await savePortfolioReport(
      request,
      save,
      'C:/Users/ana/Downloads',
      'pt-BR',
      '2026-11-17',
    );
    expect(save.chooseFile).toHaveBeenCalledWith(
      join('C:/Users/ana/Downloads', 'relatorio-aposentadoria-2026-11-17.pdf'),
    );
    expect(save.printToPdf).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      data: { saved: true, file: 'relatorio-aposentadoria-2026-11-17.pdf', folder: 'Downloads' },
    });
    expect(path).toBe(join('C:/Users/ana/Downloads', 'relatorio-aposentadoria-2026-11-17.pdf'));
    expect([...(save.files.get(path ?? '') ?? [])]).toEqual([37, 80, 68, 70]);
  });

  it('cancelar o "Salvar como" não imprime nem grava nada (CA04)', async () => {
    const save = target(null);
    const { result, path } = await savePortfolioReport(request, save, 'D:/', 'en', '2026-11-17');
    expect(save.chooseFile).toHaveBeenCalledWith(
      join('D:/', 'report-aposentadoria-2026-11-17.pdf'),
    );
    expect(result).toEqual({ ok: true, data: { saved: false } });
    expect(path).toBeNull();
    expect(save.printToPdf).not.toHaveBeenCalled();
    expect(save.files.size).toBe(0);
  });

  it('pedido estranho ou falha ao imprimir ou gravar: erro, sem arquivo pela metade', async () => {
    const save = target('C:/x.pdf');
    expect(
      (await savePortfolioReport({ portfolioName: 3 }, save, 'C:/', 'pt-BR', 'd')).result,
    ).toEqual({ ok: false, error: 'unexpected' });
    expect(save.chooseFile).not.toHaveBeenCalled();

    const broken = target('C:/x.pdf');
    broken.printToPdf = vi.fn(async () => {
      throw new Error('falhou');
    });
    const failed = await savePortfolioReport(request, broken, 'C:/', 'pt-BR', '2026-11-17');
    expect(failed).toEqual({ result: { ok: false, error: 'unexpected' }, path: null });
    expect(broken.files.size).toBe(0);

    const full = target('C:/x.pdf');
    full.writeFile = async () => {
      throw new Error('disco cheio');
    };
    expect((await savePortfolioReport(request, full, 'C:/', 'pt-BR', '2026-11-17')).result).toEqual(
      { ok: false, error: 'unexpected' },
    );
  });
});
