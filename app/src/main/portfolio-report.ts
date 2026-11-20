import { basename, dirname, join } from 'node:path';
import type {
  AppLanguage,
  ClientResult,
  ReportSaveRequest,
  ReportSaveResult,
} from '../shared/auth-ipc.js';

/** SPEC-038 §4.2: o nome sugerido segue o idioma do app; a carteira entra sem acentos. */
const FILE_PREFIX: Record<AppLanguage, string> = { 'pt-BR': 'relatorio', en: 'report' };
const FALLBACK_NAME: Record<AppLanguage, string> = { 'pt-BR': 'carteira', en: 'portfolio' };
const MAX_SLUG = 60;

/** Limites dos textos que chegam da interface (o nome da carteira tem no máximo 60). */
const MAX_NAME = 200;
const MAX_FOOTER = 300;

/** Polegadas (o Chromium mede as margens assim): sobra espaço embaixo para o rodapé. */
const MARGINS = { top: 0.5, bottom: 0.65, left: 0.5, right: 0.5 };

/** As opções do `printToPDF` do Electron que o relatório usa. */
export interface ReportPdfOptions {
  pageSize: 'A4';
  landscape: false;
  printBackground: true;
  margins: typeof MARGINS;
  displayHeaderFooter: true;
  headerTemplate: string;
  footerTemplate: string;
  /** PDF marcado: título, títulos de seção e tabelas para os leitores de tela (RNF18). */
  generateTaggedPDF: true;
  /** O sumário do PDF, pelos títulos das seções. */
  generateDocumentOutline: true;
}

/** Onde e como o relatório vira arquivo. No app: a janela "Salvar como", o Chromium e o disco. */
export interface ReportTarget {
  /** Devolve o caminho escolhido, ou null se a pessoa cancelou. */
  chooseFile(defaultPath: string): Promise<string | null>;
  /** Imprime a janela que pediu (o documento do relatório aparece só na impressão). */
  printToPdf(options: ReportPdfOptions): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
}

/**
 * "relatorio-e-se-eu-tivesse-comecado-em-2019-2026-11-17.pdf": sem acentos, em minúsculas e com
 * hífens, só letras e números (nada que o Windows proíba), no máximo 60 caracteres da carteira.
 */
export function reportFileName(portfolioName: string, language: AppLanguage, day: string): string {
  const slug = portfolioName
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return `${FILE_PREFIX[language]}-${slug || FALLBACK_NAME[language]}-${day}.pdf`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * O rodapé de cada página: o nome da carteira e o aviso curto à esquerda, "Página 2 de 5" à
 * direita. O Chromium troca `pageNumber` e `totalPages`; o modelo precisa do próprio tamanho de
 * letra (sem ele, o texto some).
 */
export function reportFooter(request: ReportSaveRequest): string {
  const page = escapeHtml(request.footerPage)
    .replace('{page}', '<span class="pageNumber"></span>')
    .replace('{pages}', '<span class="totalPages"></span>');
  return (
    '<div style="box-sizing:border-box;width:100%;padding:0 0.5in;display:flex;' +
    'justify-content:space-between;gap:16px;font-family:system-ui,sans-serif;font-size:8px;' +
    'color:#4f595f;">' +
    `<span>${escapeHtml(request.portfolioName)} · ${escapeHtml(request.footerNotice)}</span>` +
    `<span style="white-space:nowrap;">${page}</span>` +
    '</div>'
  );
}

export function reportPdfOptions(request: ReportSaveRequest): ReportPdfOptions {
  return {
    pageSize: 'A4',
    landscape: false,
    printBackground: true,
    margins: MARGINS,
    displayHeaderFooter: true,
    // Sem cabeçalho do Chromium (data e endereço): o documento já tem o dele.
    headerTemplate: '<span></span>',
    footerTemplate: reportFooter(request),
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  };
}

function isRequest(value: unknown): value is ReportSaveRequest {
  if (typeof value !== 'object' || value === null) return false;
  const { portfolioName, footerNotice, footerPage } = value as Record<string, unknown>;
  return (
    typeof portfolioName === 'string' &&
    portfolioName.length > 0 &&
    portfolioName.length <= MAX_NAME &&
    typeof footerNotice === 'string' &&
    footerNotice.length <= MAX_FOOTER &&
    typeof footerPage === 'string' &&
    footerPage.length <= MAX_FOOTER
  );
}

/**
 * "Baixar relatório (PDF)" (SPEC-038): pergunta onde gravar, imprime a janela em PDF e grava o
 * arquivo. O arquivo vai direto para o computador da pessoa: nada passa pelo servidor. Devolve
 * também o caminho gravado, que só o processo principal guarda (para o "Abrir").
 */
export async function savePortfolioReport(
  request: unknown,
  target: ReportTarget,
  downloadsDir: string,
  language: AppLanguage,
  day: string,
): Promise<{ result: ClientResult<ReportSaveResult>; path: string | null }> {
  if (!isRequest(request)) return { result: { ok: false, error: 'unexpected' }, path: null };

  const name = reportFileName(request.portfolioName, language, day);
  const path = await target.chooseFile(join(downloadsDir, name));
  if (!path) return { result: { ok: true, data: { saved: false } }, path: null };

  try {
    const pdf = await target.printToPdf(reportPdfOptions(request));
    await target.writeFile(path, pdf);
  } catch {
    return { result: { ok: false, error: 'unexpected' }, path: null };
  }
  const folder = dirname(path);
  return {
    result: {
      ok: true,
      data: { saved: true, file: basename(path), folder: basename(folder) || folder },
    },
    path,
  };
}
