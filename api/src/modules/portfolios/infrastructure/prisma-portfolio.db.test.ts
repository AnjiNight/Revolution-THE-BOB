import { randomUUID } from 'node:crypto';
import { TERMS_VERSION } from '@simulador/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaUserRepository } from '../../identity/infrastructure/prisma-user-repository.js';
import { PortfolioNameInUseError, PortfolioNotFoundError } from '../domain/errors.js';
import { PrismaLedgerRepository } from './prisma-ledger-repository.js';
import { PrismaPortfolioRepository } from './prisma-portfolio-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-012, CA10). Rodam só com TEST_DATABASE_URL apontando para um
 * banco com as migrações aplicadas. ATENÇÃO: apagam as carteiras e as contas de teste desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('carteiras no PostgreSQL', () => {
  let prisma: PrismaClient;
  let portfolios: PrismaPortfolioRepository;
  let ledger: PrismaLedgerRepository;
  let users: PrismaUserRepository;
  let userId: string;
  const at = new Date('2026-11-05T15:00:00Z');

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    portfolios = new PrismaPortfolioRepository(prisma);
    ledger = new PrismaLedgerRepository(prisma);
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
    const added = await ledger.appendCashLocked(created.id, () => deposit('0.01'));
    expect(added).toEqual({
      id: expect.any(String),
      portfolioId: created.id,
      type: 'deposit',
      amount: '0.01',
      date: '2019-03-15',
      recordedAt: at,
    });
    expect((await ledger.ledger(created.id)).cash.map((e) => [e.amount, e.date])).toEqual([
      ['5000.10', '2019-01-02'],
      ['0.01', '2019-03-15'],
    ]);
    const byPortfolio = await ledger.ledgers([created.id, randomUUID()]);
    expect(byPortfolio.get(created.id)?.cash).toHaveLength(2);
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
    const entry = await ledger.appendCashLocked(created.id, () => deposit('100'));
    await expect(
      prisma.lancamentoCaixa.update({ where: { id: entry.id }, data: { valor: '1' } }),
    ).rejects.toThrow(/lancamento_caixa_imutavel|RB08/);
    await expect(ledger.appendCashLocked(created.id, () => deposit('0'))).rejects.toThrow();
    await expect(
      ledger.appendCashLocked(created.id, () => deposit('10000000.01')),
    ).rejects.toThrow();
    await expect(
      ledger.appendCashLocked(created.id, () => deposit('1', '2015-12-30')),
    ).rejects.toThrow();
    // 05/11/2026 12:00 em Brasília: o dia 06/11 ainda não chegou.
    await expect(
      ledger.appendCashLocked(created.id, () => deposit('1', '2026-11-06')),
    ).rejects.toThrow();
    // 05/11/2026 23:30 em Brasília já é 06/11 em UTC, e o dia 05/11 é aceito.
    const late = new Date('2026-11-06T02:30:00Z');
    expect(
      (await ledger.appendCashLocked(created.id, () => deposit('1', '2026-11-05', late))).date,
    ).toBe('2026-11-05');
  });

  it('caixa: dois pedidos ao mesmo tempo são conferidos um depois do outro (CA04)', async () => {
    const created = await portfolios.create(
      newPortfolio('Dividendos', { initialDeposit: deposit('1000', '2019-01-02') }),
    );
    // Retira 600 só se o saldo der: com a trava, o segundo já vê a primeira retirada.
    const withdraw = () =>
      ledger.appendCashLocked(created.id, (current) => {
        const balance = current.cash.reduce(
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
    await ledger.appendCashLocked(first.id, () => deposit('1'));
    await portfolios.delete(first.id, at);
    expect(await prisma.lancamentoCaixa.count()).toBe(0);
    expect(await prisma.exclusaoCarteira.findFirst()).toMatchObject({ lancamentos: 2 });
    await expect(ledger.appendCashLocked(first.id, () => deposit('1'))).rejects.toThrow(
      PortfolioNotFoundError,
    );

    const second = await portfolios.create(
      newPortfolio('Outra', { initialDeposit: deposit('10', '2019-01-02') }),
    );
    expect(second.id).toBeDefined();
    await users.deleteAccount(userId, at);
    expect(await prisma.lancamentoCaixa.count()).toBe(0);
  });

  // --- SPEC-014: compras e vendas ---

  const newAsset = async () => {
    const ticker = `T${randomUUID().replace(/\D/g, '').slice(0, 3)}3`.slice(0, 5);
    const row = await prisma.ativo.create({
      data: { ticker, nome: 'Teste', classe: 'acao', setor: 'bens_industriais', atualizadoEm: at },
    });
    return row.id;
  };

  /** 05/11/2026 12:00 em Brasília, com a cotação das 11:30. */
  const buy = (assetId: string, quantity: number, price = '31.20', total?: string) => ({
    assetId,
    type: 'buy' as const,
    quantity,
    price,
    total: total ?? (Math.round(quantity * Number(price) * 100) / 100).toFixed(2),
    date: '2026-11-05',
    recordedAt: at,
    quotedAt: new Date('2026-11-05T14:30:00Z'),
    level: 'free' as const,
    source: 'brapi' as const,
  });

  const livePortfolio = () =>
    portfolios.create(
      newPortfolio('Ao vivo', {
        type: 'live',
        startDate: '2026-11-05',
        initialDeposit: deposit('5000', '2026-11-05'),
      }),
    );

  it('negociação: grava e lê preço, total, dia e a cotação usada sem desvio de fuso (CA06)', async () => {
    const assetId = await newAsset();
    const portfolio = await livePortfolio();
    const stored = await ledger.appendTradeLocked(portfolio.id, () => buy(assetId, 100));
    expect(stored).toEqual({
      id: expect.any(String),
      portfolioId: portfolio.id,
      ...buy(assetId, 100),
      total: '3120.00',
    });
    const read = await ledger.ledger(portfolio.id);
    expect(read.trades).toEqual([stored]);
    expect(read.cash).toHaveLength(1);
  });

  it('negociação: o banco recusa alterar, quantidade fora da faixa, total errado e dia trocado (CA08, CA12)', async () => {
    const assetId = await newAsset();
    const portfolio = await livePortfolio();
    const stored = await ledger.appendTradeLocked(portfolio.id, () => buy(assetId, 10));
    await expect(
      prisma.transacao.update({ where: { id: stored.id }, data: { quantidade: 11 } }),
    ).rejects.toThrow(/transacao_imutavel|RB08/);
    const refused = (trade: ReturnType<typeof buy>) =>
      expect(ledger.appendTradeLocked(portfolio.id, () => trade)).rejects.toThrow();
    await refused(buy(assetId, 0, '31.20', '0.00'));
    await refused(buy(assetId, 1_000_001, '1.00', '1000001.00'));
    await refused(buy(assetId, 10, '31.20', '312.01'));
    await refused({ ...buy(assetId, 10), date: '2026-11-04' });
    // Sábado: o dia bate com o registro e a cotação, mas não é dia de semana (RB11).
    const saturday = new Date('2026-11-07T15:00:00Z');
    await refused({
      ...buy(assetId, 10),
      date: '2026-11-07',
      recordedAt: saturday,
      quotedAt: saturday,
    });
    // O ativo com negociação não pode ser apagado.
    await expect(prisma.ativo.delete({ where: { id: assetId } })).rejects.toThrow();
    expect(await prisma.transacao.count()).toBe(1);
  });

  it('negociação: duas compras ao mesmo tempo nunca passam do caixa (CA07)', async () => {
    const assetId = await newAsset();
    const portfolio = await livePortfolio();
    const buyIfCash = () =>
      ledger.appendTradeLocked(portfolio.id, (current) => {
        const spent = current.trades.reduce((sum, trade) => sum + Number(trade.total), 0);
        if (5000 - spent < 3120) throw new Error('saldo insuficiente');
        return buy(assetId, 100);
      });
    const results = await Promise.allSettled([buyIfCash(), buyIfCash()]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await prisma.transacao.count()).toBe(1);
  });

  it('negociação: excluir a carteira conta as negociações; excluir a conta as leva (CA08)', async () => {
    const assetId = await newAsset();
    const first = await livePortfolio();
    await ledger.appendTradeLocked(first.id, () => buy(assetId, 10));
    await portfolios.delete(first.id, at);
    expect(await prisma.transacao.count()).toBe(0);
    expect(await prisma.exclusaoCarteira.findFirst()).toMatchObject({ lancamentos: 2 });

    const second = await livePortfolio();
    await ledger.appendTradeLocked(second.id, () => buy(assetId, 5));
    await users.deleteAccount(userId, at);
    expect(await prisma.transacao.count()).toBe(0);
  });

  // --- SPEC-015: estornos ---

  it('estorno: grava e lê de volta o lançamento estornado, do caixa ou da negociação (CA02)', async () => {
    const assetId = await newAsset();
    const portfolio = await livePortfolio();
    const [deposit] = (await ledger.ledger(portfolio.id)).cash;
    const trade = await ledger.appendTradeLocked(portfolio.id, () => buy(assetId, 10));
    const first = await ledger.appendReversalLocked(portfolio.id, () => ({
      entryId: trade.id,
      entryKind: 'trade',
      recordedAt: at,
    }));
    expect(first).toEqual({
      id: expect.any(String),
      portfolioId: portfolio.id,
      entryId: trade.id,
      entryKind: 'trade',
      recordedAt: at,
    });
    await ledger.appendReversalLocked(portfolio.id, () => ({
      entryId: deposit?.id ?? '',
      entryKind: 'cash',
      recordedAt: at,
    }));
    const read = await ledger.ledger(portfolio.id);
    expect(read.reversals.map((reversal) => reversal.entryKind).sort()).toEqual(['cash', 'trade']);
    expect((await ledger.ledgers([portfolio.id])).get(portfolio.id)?.reversals).toHaveLength(2);
  });

  it('estorno: o banco recusa alterar, estornar duas vezes e lançamento de outra carteira (CA07, CA11)', async () => {
    const portfolio = await livePortfolio();
    const other = await portfolios.create(
      newPortfolio('Outra', {
        type: 'live',
        startDate: '2026-11-05',
        initialDeposit: deposit('10', '2026-11-05'),
      }),
    );
    const [entry] = (await ledger.ledger(portfolio.id)).cash;
    const [foreign] = (await ledger.ledger(other.id)).cash;
    const reverseCash = (entryId: string) =>
      ledger.appendReversalLocked(portfolio.id, () => ({
        entryId,
        entryKind: 'cash',
        recordedAt: at,
      }));

    const stored = await reverseCash(entry?.id ?? '');
    await expect(
      prisma.estorno.update({ where: { id: stored.id }, data: { registradoEm: new Date() } }),
    ).rejects.toThrow(/estorno_imutavel|RB08/);
    await expect(reverseCash(entry?.id ?? '')).rejects.toThrow();
    await expect(reverseCash(foreign?.id ?? '')).rejects.toThrow(/estorno_mesma_carteira|RB28/);
    // Nenhum lançamento, ou os dois: o banco recusa.
    await expect(
      prisma.estorno.create({ data: { carteiraId: portfolio.id, registradoEm: at } }),
    ).rejects.toThrow();
    expect(await prisma.estorno.count()).toBe(1);
  });

  it('estorno: excluir a carteira conta os estornos; excluir a conta os leva (CA07)', async () => {
    const first = await livePortfolio();
    const [entry] = (await ledger.ledger(first.id)).cash;
    await ledger.appendReversalLocked(first.id, () => ({
      entryId: entry?.id ?? '',
      entryKind: 'cash',
      recordedAt: at,
    }));
    await portfolios.delete(first.id, at);
    expect(await prisma.estorno.count()).toBe(0);
    expect(await prisma.exclusaoCarteira.findFirst()).toMatchObject({ lancamentos: 2 });

    const second = await livePortfolio();
    const [again] = (await ledger.ledger(second.id)).cash;
    await ledger.appendReversalLocked(second.id, () => ({
      entryId: again?.id ?? '',
      entryKind: 'cash',
      recordedAt: at,
    }));
    await users.deleteAccount(userId, at);
    expect(await prisma.estorno.count()).toBe(0);
  });
});
