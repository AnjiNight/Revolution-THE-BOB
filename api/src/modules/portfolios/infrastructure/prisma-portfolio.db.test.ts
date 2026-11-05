import { TERMS_VERSION } from '@simulador/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaUserRepository } from '../../identity/infrastructure/prisma-user-repository.js';
import { PortfolioNameInUseError } from '../domain/errors.js';
import { PrismaPortfolioRepository } from './prisma-portfolio-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-012, CA10). Rodam só com TEST_DATABASE_URL apontando para um
 * banco com as migrações aplicadas. ATENÇÃO: apagam as carteiras e as contas de teste desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('carteiras no PostgreSQL', () => {
  let prisma: PrismaClient;
  let portfolios: PrismaPortfolioRepository;
  let users: PrismaUserRepository;
  let userId: string;
  const at = new Date('2026-11-05T15:00:00Z');

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    portfolios = new PrismaPortfolioRepository(prisma);
    users = new PrismaUserRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE usuario, exclusao_conta, exclusao_carteira CASCADE',
    );
    const user = await users.create({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      role: 'user',
      passwordHash: '$argon2id$fake',
      googleSub: null,
      termsVersion: TERMS_VERSION,
      emailConfirmedAt: at,
    });
    userId = user.id;
  });

  const newPortfolio = (name: string, overrides: Record<string, unknown> = {}) => ({
    userId,
    name,
    nameKey: name.toLowerCase(),
    type: 'historical' as const,
    startDate: '2019-01-02',
    at,
    ...overrides,
  });

  it('grava e lê de volta sem desvio de fuso; a mesma chave do mesmo usuário é recusada (CA03)', async () => {
    const created = await portfolios.create(newPortfolio('Dividendos'));
    expect(await portfolios.findById(created.id)).toEqual({
      id: created.id,
      userId,
      name: 'Dividendos',
      type: 'historical',
      startDate: '2019-01-02',
      createdAt: at,
      updatedAt: at,
    });
    await expect(
      portfolios.create(newPortfolio('DIVIDENDOS', { nameKey: 'dividendos' })),
    ).rejects.toThrow(PortfolioNameInUseError);
    expect(await portfolios.countByUser(userId)).toBe(1);
  });

  it('o banco não deixa mudar o tipo (gatilho) nem começar a histórica no fim de semana (CA04, CA10)', async () => {
    const created = await portfolios.create(newPortfolio('Dividendos'));
    await expect(
      prisma.carteira.update({ where: { id: created.id }, data: { tipo: 'ao_vivo' } }),
    ).rejects.toThrow();
    await expect(
      portfolios.create(newPortfolio('Sábado', { startDate: '2019-01-05' })),
    ).rejects.toThrow();
    await expect(
      portfolios.create(newPortfolio('Antes', { startDate: '2015-12-30' })),
    ).rejects.toThrow();
    // A ao vivo começa no dia da criação, que pode ser um sábado.
    const live = await portfolios.create(
      newPortfolio('Ao vivo', { type: 'live', startDate: '2026-11-07' }),
    );
    expect(live.startDate).toBe('2026-11-07');
  });

  it('excluir grava o registro sem dado pessoal; excluir a conta leva as carteiras (CA06, CA07)', async () => {
    const first = await portfolios.create(newPortfolio('Dividendos'));
    await portfolios.delete(first.id, at);
    expect(await portfolios.findById(first.id)).toBeNull();
    expect(await prisma.exclusaoCarteira.findMany()).toEqual([
      expect.objectContaining({
        carteiraId: first.id,
        tipo: 'historica',
        lancamentos: 0,
        excluidaEm: at,
      }),
    ]);

    await portfolios.create(newPortfolio('Outra'));
    await users.deleteAccount(userId, at);
    expect(await prisma.carteira.count()).toBe(0);
    // A exclusão da conta não grava exclusão de carteira (a da conta já tem o seu registro).
    expect(await prisma.exclusaoCarteira.count()).toBe(1);
  });
});
