import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { EMAIL_CODE_ALPHABET, EMAIL_CODE_LENGTH } from '@simulador/shared';

/** Código enviado por e-mail (SPEC-004, SPEC-039): 8 caracteres sorteados com gerador criptográfico. */
export function generateEmailCode(): string {
  let code = '';
  for (let i = 0; i < EMAIL_CODE_LENGTH; i += 1) {
    code += EMAIL_CODE_ALPHABET[randomInt(EMAIL_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Guarda e compara códigos só pelo HMAC-SHA-256. Um código de 40 bits com SHA-256 puro poderia
 * ser descoberto testando todas as combinações a partir de uma cópia do banco; com HMAC, quem não
 * tem o segredo do servidor não consegue (QA06).
 */
export class EmailCodeHasher {
  private readonly key: Buffer;

  constructor(serverSecret: string) {
    // Chave própria derivada do segredo do servidor: o mesmo segredo não serve a dois propósitos.
    this.key = createHmac('sha256', serverSecret).update('simulador:codigo-email').digest();
  }

  /** Recebe o código já normalizado (normalizeEmailCode). */
  hash(code: string): string {
    return createHmac('sha256', this.key).update(code).digest('hex');
  }

  matches(codeHash: string, code: string): boolean {
    const expected = Buffer.from(codeHash, 'hex');
    const actual = Buffer.from(this.hash(code), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
