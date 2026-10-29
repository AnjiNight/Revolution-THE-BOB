import { randomUUID } from 'node:crypto';
import { FII_SEGMENTS, STOCK_SECTORS } from '@simulador/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaAuditTrail } from '../../audit/infrastructure/prisma-audit.js';
import { AssetCatalogService } from '../application/asset-catalog-service.js';
import { AssetValidationError, TickerInUseError } from '../domain/errors.js';
import { PrismaAssetRepository } from './prisma-asset-repository.js';

/**
 * Testes contra PostgreSQL real (CA03, CA07, CA12). Rodam só com TEST_DATABASE_URL apontando para
 * um banco com as migrações aplicadas. ATENÇÃO: apagam o catálogo desse banco. O registro de
 * auditoria não é apagado (só aceita inclusões): cada teste usa um id de colaborador próprio.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('catálogo de ativos no PostgreSQL', () => {
  let prisma: PrismaClient;
  let assets: PrismaAssetRepository;
  let auditTrail: PrismaAuditTrail;
  let service: AssetCatalogService;
  let collaborator: string;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    assets = new PrismaAssetRepository(prisma);
    auditTrail = new PrismaAuditTrail(prisma);
    service = new AssetCatalogService({ assets });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // CASCADE: o histórico de cotações (SPEC-008) aponta para o ativo.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE ativo CASCADE');
    collaborator = randomUUID();
  });

  const petr4 = {
    ticker: 'PETR4',
    name: 'Petrobras PN',
    class: 'stock',
    sector: 'petroleo_gas_biocombustiveis',
  } as const;
  const mxrf11 = {
    ticker: 'MXRF11',
    name: 'Maxi Renda FII',
    class: 'fii',
    sector: 'recebiveis',
  } as const;

  it('a lista fixa de setores e segmentos vem da migração, igual à do app (§4)', async () => {
    const rows = await prisma.setor.findMany();
    const byClass = (classe: 'acao' | 'fii') =>
      rows
        .filter((row) => row.classe === classe)
        .map((row) => row.codigo)
        .sort();
    expect(byClass('acao')).toEqual([...STOCK_SECTORS].sort());
    expect(byClass('fii')).toEqual([...FII_SEGMENTS].sort());
  });

  it('cadastra, lista com filtros e conta os ativos', async () => {
    const created = await service.create(petr4, collaborator);
    await service.create(mxrf11, collaborator);
    expect(await assets.findById(created.id)).toMatchObject({
      ticker: 'PETR4',
      assetClass: 'stock',
      sector: 'petroleo_gas_biocombustiveis',
      deactivatedAt: null,
    });
    expect((await assets.list({ status: 'all', assetClass: 'fii' })).map((a) => a.ticker)).toEqual([
      'MXRF11',
    ]);
    expect(
      (await assets.list({ status: 'all', sector: 'recebiveis' })).map((a) => a.ticker),
    ).toEqual(['MXRF11']);

    await service.deactivate(created.id, collaborator);
    expect((await assets.list({ status: 'active' })).map((a) => a.ticker)).toEqual(['MXRF11']);
    expect((await assets.list({ status: 'inactive' })).map((a) => a.ticker)).toEqual(['PETR4']);
    expect(await assets.countActive()).toBe(1);
  });

  it('busca do usuário sem acentos e só com ativos ativos', async () => {
    await service.create(
      { ...petr4, ticker: 'ITUB4', name: 'Itaú Unibanco PN', sector: 'financeiro' },
      collaborator,
    );
    const off = await service.create(mxrf11, collaborator);
    await service.deactivate(off.id, collaborator);
    expect((await service.search({ q: 'itau' })).assets.map((a) => a.ticker)).toEqual(['ITUB4']);
    expect((await service.search({ q: 'maxi' })).assets).toEqual([]);
  });

  it('ticker repetido vira TickerInUseError, no cadastro e na edição, sem gravar auditoria', async () => {
    await service.create(petr4, collaborator);
    const fii = await service.create(mxrf11, collaborator);
    await expect(service.create({ ...petr4, name: 'Outro' }, collaborator)).rejects.toBeInstanceOf(
      TickerInUseError,
    );
    await expect(service.update(fii.id, { ticker: 'PETR4' }, collaborator)).rejects.toBeInstanceOf(
      TickerInUseError,
    );
    expect((await assets.findById(fii.id))?.ticker).toBe('MXRF11');
    expect((await auditTrail.byCollaborator(collaborator)).map((e) => e.action)).toEqual([
      'asset_created',
      'asset_created',
    ]);
  });

  it('edição grava a mudança e a auditoria juntas; regra recusada não grava nada', async () => {
    const created = await service.create(
      { ...petr4, ticker: 'BRDT3', name: 'BR Distribuidora' },
      collaborator,
    );
    const updated = await service.update(
      created.id,
      { ticker: 'VBBR3', name: 'Vibra Energia', sector: 'utilidade_publica' },
      collaborator,
    );
    expect(updated).toMatchObject({
      ticker: 'VBBR3',
      name: 'Vibra Energia',
      sector: 'utilidade_publica',
    });

    await expect(
      service.update(created.id, { sector: 'logistica' }, collaborator),
    ).rejects.toBeInstanceOf(AssetValidationError);
    expect((await assets.findById(created.id))?.sector).toBe('utilidade_publica');

    const entries = await auditTrail.forEntity('asset', created.id);
    expect(entries.map((e) => e.action)).toEqual(['asset_created', 'asset_updated']);
    expect(entries[1]).toMatchObject({
      collaboratorId: collaborator,
      entity: 'asset',
      details: {
        before: {
          ticker: 'BRDT3',
          name: 'BR Distribuidora',
          sector: 'petroleo_gas_biocombustiveis',
        },
        after: { ticker: 'VBBR3', name: 'Vibra Energia', sector: 'utilidade_publica' },
      },
    });
  });

  it('desativar e reativar repetidos não gravam de novo (CA08)', async () => {
    const created = await service.create(petr4, collaborator);
    await service.deactivate(created.id, collaborator);
    await service.deactivate(created.id, collaborator);
    await service.reactivate(created.id, collaborator);
    await service.reactivate(created.id, collaborator);
    expect((await auditTrail.forEntity('asset', created.id)).map((e) => e.action)).toEqual([
      'asset_created',
      'asset_deactivated',
      'asset_reactivated',
    ]);
  });

  it('ativo que não existe: modify devolve null', async () => {
    expect(await assets.modify(randomUUID(), () => null)).toBeNull();
  });

  it('duas edições ao mesmo tempo no mesmo ativo esperam uma pela outra', async () => {
    const created = await service.create(petr4, collaborator);
    await Promise.all([
      service.update(created.id, { name: 'Nome A' }, collaborator),
      service.update(created.id, { name: 'Nome B' }, collaborator),
    ]);
    const updates = (await auditTrail.forEntity('asset', created.id)).filter(
      (e) => e.action === 'asset_updated',
    );
    // A segunda viu o resultado da primeira: o "antes" dela é o "depois" da outra.
    expect(updates).toHaveLength(2);
    expect(updates[1]?.details.before).toEqual(updates[0]?.details.after);
  });

  describe('restrições do banco (CA12)', () => {
    const insert = (ticker: string, nome: string, classe: string, setor: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO ativo (ticker, nome, classe, setor, atualizado_em) VALUES ('${ticker}', '${nome}', '${classe}', '${setor}', now())`,
      );

    it('ticker no formato da B3', async () => {
      await expect(insert('petr4', 'Petrobras', 'acao', 'outros')).rejects.toThrow(
        /ativo_ticker_formato_chk/,
      );
      await expect(insert('PETR4F', 'Petrobras', 'acao', 'outros')).rejects.toThrow();
      await expect(insert('PETR', 'Petrobras', 'acao', 'outros')).rejects.toThrow(
        /ativo_ticker_formato_chk/,
      );
    });

    it('nome de 2 a 100 caracteres, sem contar espaços nas pontas', async () => {
      await expect(insert('PETR4', ' P ', 'acao', 'outros')).rejects.toThrow(
        /ativo_nome_tamanho_chk/,
      );
    });

    it('ticker único', async () => {
      await insert('PETR4', 'Petrobras', 'acao', 'outros');
      await expect(insert('PETR4', 'Outra', 'acao', 'outros')).rejects.toThrow(/ativo_ticker_key/);
    });

    it('classe fora da lista e setor de outra classe são recusados', async () => {
      await expect(insert('BOVA11', 'ETF', 'etf', 'outros')).rejects.toThrow(/classe_ativo/);
      await expect(insert('MXRF11', 'Maxi Renda', 'fii', 'financeiro')).rejects.toThrow(
        /ativo_classe_setor_fkey/,
      );
    });

    it('a classe nunca muda, nem por SQL direto (RB22)', async () => {
      await insert('PETR4', 'Petrobras', 'acao', 'outros');
      await expect(
        prisma.$executeRawUnsafe(`UPDATE ativo SET classe = 'fii' WHERE ticker = 'PETR4'`),
      ).rejects.toThrow(/ativo_classe_imutavel|RB22/);
      // Outros campos continuam editáveis.
      await prisma.$executeRawUnsafe(`UPDATE ativo SET nome = 'Petróleo' WHERE ticker = 'PETR4'`);
      expect((await prisma.ativo.findUnique({ where: { ticker: 'PETR4' } }))?.classe).toBe('acao');
    });

    it('a lista de setores não pode ser apagada enquanto um ativo usa o setor', async () => {
      await insert('PETR4', 'Petrobras', 'acao', 'outros');
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM setor WHERE classe = 'acao' AND codigo = 'outros'`),
      ).rejects.toThrow(/ativo_classe_setor_fkey/);
    });
  });
});
