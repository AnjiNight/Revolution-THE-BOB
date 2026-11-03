import type { LogoImage, LogoSource, LogoType } from '../application/ports.js';

/** Servidor de ícones da brapi: o único de onde o servidor baixa logos (SPEC-040 §4.2). */
export const BRAPI_ICON_HOSTS = ['icons.brapi.dev'] as const;
/** Logo maior que isto não é aceito (os da brapi têm de 0,5 a 5 KB). */
export const MAX_LOGO_BYTES = 100 * 1024;

const REQUEST_TIMEOUT_MS = 15_000;

export interface BrapiLogoSourceOptions {
  /** Servidores aceitos (os testes trocam pelo servidor falso). */
  hosts?: readonly string[];
  /** Só HTTPS; os testes ligam o HTTP local. */
  allowHttp?: boolean;
  fetch?: typeof fetch;
}

/** Logo que não serve: endereço de outro lugar, resposta de erro, tipo ou tamanho errado. */
export class LogoRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogoRejectedError';
  }
}

/**
 * Baixa o logo de um ativo (DA06), conferindo o endereço, o tipo e o tamanho antes de aceitar. A
 * imagem fica guardada no banco e o app a recebe do nosso servidor, nunca da internet.
 */
export class BrapiLogoSource implements LogoSource {
  private readonly hosts: readonly string[];
  private readonly fetch: typeof fetch;

  constructor(private readonly options: BrapiLogoSourceOptions = {}) {
    this.hosts = options.hosts ?? BRAPI_ICON_HOSTS;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async download(url: string): Promise<LogoImage> {
    const address = this.checkedUrl(url);
    let response: Response;
    try {
      response = await this.fetch(address, {
        headers: { accept: 'image/svg+xml, image/png' },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new LogoRejectedError(
        `logo não baixou (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (!response.ok) throw new LogoRejectedError(`logo respondeu ${response.status}`);
    const type = logoType(response.headers.get('content-type'));
    if (!type) {
      throw new LogoRejectedError(
        `logo com tipo não aceito (${response.headers.get('content-type') ?? 'sem tipo'})`,
      );
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) {
      throw new LogoRejectedError(`logo com ${declared} bytes (máximo ${MAX_LOGO_BYTES})`);
    }
    const content = new Uint8Array(await response.arrayBuffer());
    if (content.length === 0 || content.length > MAX_LOGO_BYTES) {
      throw new LogoRejectedError(`logo com ${content.length} bytes (máximo ${MAX_LOGO_BYTES})`);
    }
    if (!looksLike(type, content)) throw new LogoRejectedError(`conteúdo não é ${type}`);
    return { type, content };
  }

  private checkedUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new LogoRejectedError('endereço do logo inválido');
    }
    const protocolOk =
      parsed.protocol === 'https:' ||
      (this.options.allowHttp === true && parsed.protocol === 'http:');
    if (!protocolOk) throw new LogoRejectedError('logo fora de HTTPS');
    if (!this.hosts.includes(parsed.host)) {
      throw new LogoRejectedError(`logo de outro servidor (${parsed.host})`);
    }
    return parsed.toString();
  }
}

function logoType(contentType: string | null): LogoType | null {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  return type === 'image/svg+xml' || type === 'image/png' ? type : null;
}

/** O começo do arquivo confere com o tipo: PNG pela assinatura, SVG pela marca `<svg`. */
function looksLike(type: LogoType, content: Uint8Array): boolean {
  if (type === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => content[index] === byte);
  }
  return new TextDecoder().decode(content.subarray(0, 2048)).includes('<svg');
}
