import { randomUUID } from 'node:crypto';
import { TERMS_VERSION } from '@simulador/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaUserRepository } from '../../identity/infrastructure/prisma-user-repository.js';
import { PortfolioNameInUseError, PortfolioNotFoundError } from '../domain/errors.js';
import { PrismaCashEntryRepository } from './prisma-cash-entry-repository.js';
import { PrismaPortfolioRepository } from './prisma-portfolio-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-012, CA10). Rodam só com TEST_DATABASE_URL apontando para um
 * banco com as migrações aplicadas. ATENÇÃO: apagam as carteiras e as contas de teste desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('carteiras no PostgreSQL', () => {
  let prisma: PrismaClient;
  let portfolios: PrismaPortfolioRepository;
  let cash: PrismaCashEntryRepository;
  let users: PrismaUserRepository;
  let userId: string;
  const at = new Date('2026-11-05T15:00:00Z');

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    portfolios = new PrismaPortfolioRepository(prisma);
    cash = new PrismaCashEntryRepository(prisma);
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

  // --- SPEC-013: livro-razão do caixa ---

  const deposit = (amount: string, date = '2019-03-15', recordedAt = at) => ({
    type: 'deposit' as const,
    amount,
    date,
    recordedAt,
  });

  it('caixa: grava e lê o valor em decimal e o dia sem desvio de fuso; valor inicial vai junto (CA06)', async () => {
    const created = await portfolios.create(
      newPortfolio('Dividendos', { initialDeposit: deposit('5000.10', '2019-01-02') }),
    );
    const added = await cash.appendLocked(created.id, () => deposit('0.01'));
    expect(added).toEqual({
      id: expect.any(String),
      portfolioId: created.id,
      type: 'deposit',
      amount: '0.01',
      date: '2019-03-15',
      recordedAt: at,
    });
    expect((await cash.listByPortfolio(created.id)).map((e) => [e.amount, e.date])).toEqual([
      ['5000.10', '2019-01-02'],
      ['0.01', '2019-03-15'],
    ]);
    const byPortfolio = await cash.listByPortfolios([created.id, randomUUID()]);
    expect(byPortfolio.get(created.id)).toHaveLength(2);
  });

  it('caixa: carteira com nome repetido não deixa o aporte inicial gravado (CA06)', async () => {
    await portfolios.create(newPortfolio('Dividendos'));
    await expect(
      portfolios.create(
        newPortfolio('DIVIDENDOS', { nameKey: 'dividendos', initialDeposit: deposit('100') }),
      ),
    ).rejects.toThrow(PortfolioNameInUseError);
    expect(await prisma.lancamentoCaixa.count()).toBe(0);
  });

  it('caixa: o banco recusa alterar o lançamento, valor fora da faixa e dia depois do registro (CA07, CA11)', async () => {
    const created = await portfolios.create(newPortfolio('Dividendos'));
    const entry = await cash.appendLocked(created.id, () => deposit('100'));
    await expect(
      prisma.lancamentoCaixa.update({ where: { id: entry.id }, data: { valor: '1' } }),
    ).rejects.toThrow(/lancamento_caixa_imutavel|RB08/);
    await expect(cash.appendLocked(created.id, () => deposit('0'))).rejects.toThrow();
    await expect(cash.appendLocked(created.id, () => deposit('10000000.01'))).rejects.toThrow();
    await expect(cash.appendLocked(created.id, () => deposit('1', '2015-12-30'))).rejects.toThrow();
    // 05/11/2026 12:00 em Brasília: o dia 06/11 ainda não chegou.
    await expect(cash.appendLocked(created.id, () => deposit('1', '2026-11-06'))).rejects.toThrow();
    // 05/11/2026 23:30 em Brasília já é 06/11 em UTC, e o dia 05/11 é aceito.
    const late = new Date('2026-11-06T02:30:00Z');
    expect((await cash.appendLocked(created.id, () => deposit('1', '2026-11-05', late))).date).toBe(
      '2026-11-05',
    );
  });

  it('caixa: dois pedidos ao mesmo tempo são conferidos um depois do outro (CA04)', async () => {
    const created = await portfolios.create(
      newPortfolio('Dividendos', { initialDeposit: deposit('1000', '2019-01-02') }),
    );
    // Retira 600 só se o saldo der: com a trava, o segundo já vê a primeira retirada.
    const withdraw = () =>
      cash.appendLocked(created.id, (current) => {
        const balance = current.reduce(
          (sum, e) => sum + (e.type === 'deposit' ? 1 : -1) * Number(e.amount),
          0,
        );
        if (balance < 600) throw new Error('saldo insuficiente');
        return { type: 'withdrawal', amount: '600.00', date: '2019-03-15', recordedAt: at };
      });
    const results = await Promise.allSettled([withdraw(), withdraw()]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await prisma.lancamentoCaixa.count({ where: { tipo: 'retirada' } })).toBe(1);
  });

  it('caixa: excluir a carteira apaga os lançamentos e conta quantos eram; a conta também leva (CA07)', async () => {
    const first = await portfolios.create(
      newPortfolio('Dividendos', { initialDeposit: deposit('1000', '2019-01-02') }),
    );
    await cash.appendLocked(first.id, () => deposit('1'));
    await portfolios.delete(first.id, at);
    expect(await prisma.lancamentoCaixa.count()).toBe(0);
    expect(await prisma.exclusaoCarteira.findFirst()).toMatchObject({ lancamentos: 2 });
    await expect(cash.appendLocked(first.id, () => deposit('1'))).rejects.toThrow(
      PortfolioNotFoundError,
    );

    const second = await portfolios.create(
      newPortfolio('Outra', { initialDeposit: deposit('10', '2019-01-02') }),
    );
    expect(second.id).toBeDefined();
    await users.deleteAccount(userId, at);
    expect(await prisma.lancamentoCaixa.count()).toBe(0);
  });
});
