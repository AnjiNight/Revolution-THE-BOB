import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { RESET_CODE_ALPHABET, RESET_CODE_LENGTH } from '@simulador/shared';

/** Código de redefinição (SPEC-004): 8 caracteres sorteados com gerador criptográfico. */
export function generateResetCode(): string {
  let code = '';
  for (let i = 0; i < RESET_CODE_LENGTH; i += 1) {
    code += RESET_CODE_ALPHABET[randomInt(RESET_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Guarda e compara códigos só pelo HMAC-SHA-256. Um código de 40 bits com SHA-256 puro poderia
 * ser descoberto testando todas as combinações a partir de uma cópia do banco; com HMAC, quem não
 * tem o segredo do servidor não consegue (QA06).
 */
export class ResetCodeHasher {
  private readonly key: Buffer;

  constructor(serverSecret: string) {
    // Chave própria derivada do segredo do servidor: o mesmo segredo não serve a dois propósitos.
    this.key = createHmac('sha256', serverSecret).update('simulador:redefinicao-senha').digest();
  }

  /** Recebe o código já normalizado (normalizeResetCode). */
  hash(code: string): string {
    return createHmac('sha256', this.key).update(code).digest('hex');
  }

  matches(codeHash: string, code: string): boolean {
    const expected = Buffer.from(codeHash, 'hex');
    const actual = Buffer.from(this.hash(code), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
