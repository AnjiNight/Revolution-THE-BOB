import { randomInt } from 'node:crypto';
import type { PrismaClient } from '../shared/infrastructure/database.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Ticker de teste que ainda não está no banco, no formato que o banco aceita
 * (`^[A-Z][A-Z0-9]{3}[0-9]{1,2}$`): a letra inicial, 3 sorteados entre letras e dígitos (46.656
 * combinações) e o final da classe ("3" ou "11").
 *
 * O banco de teste guarda os ativos de execuções anteriores, e só 3 dígitos (1.000 combinações) já
 * colidiram na CI (`ativo_ticker_key`, 07/11/2026): por isso confere antes e sorteia de novo.
 */
export async function uniqueTicker(
  prisma: PrismaClient,
  first: string,
  end: string,
): Promise<string> {
  for (;;) {
    let middle = '';
    for (let i = 0; i < 3; i += 1) middle += CHARS.charAt(randomInt(CHARS.length));
    const ticker = `${first}${middle}${end}`;
    const taken = await prisma.ativo.findUnique({ where: { ticker }, select: { id: true } });
    if (!taken) return ticker;
  }
}
