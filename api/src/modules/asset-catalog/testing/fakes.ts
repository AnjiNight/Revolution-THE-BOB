import type { AuditEntry } from '../../audit/application/audit.js';
import { InMemoryAuditTrail } from '../../audit/testing/fakes.js';
import type { AssetFilter, AssetModification, AssetRepository } from '../application/ports.js';
import { isActive, type StoredAsset } from '../domain/asset.js';
import { TickerInUseError } from '../domain/errors.js';

/** Catálogo em memória para testes sem banco, com as mesmas regras do PostgreSQL. */
export class InMemoryAssetRepository implements AssetRepository {
  readonly assets: StoredAsset[] = [];

  constructor(readonly audit: InMemoryAuditTrail = new InMemoryAuditTrail()) {}

  list(filter: AssetFilter): Promise<StoredAsset[]> {
    const found = this.assets.filter(
      (asset) =>
        (filter.status === 'all' || (filter.status === 'active') === isActive(asset)) &&
        (filter.assetClass === undefined || asset.assetClass === filter.assetClass) &&
        (filter.sector === undefined || asset.sector === filter.sector),
    );
    return Promise.resolve(found.map(copy));
  }

  countActive(): Promise<number> {
    return Promise.resolve(this.assets.filter(isActive).length);
  }

  findById(id: string): Promise<StoredAsset | null> {
    const found = this.assets.find((asset) => asset.id === id);
    return Promise.resolve(found ? copy(found) : null);
  }

  create(asset: StoredAsset, audit: AuditEntry): Promise<StoredAsset> {
    if (this.assets.some((other) => other.ticker === asset.ticker)) {
      return Promise.reject(new TickerInUseError());
    }
    this.assets.push(copy(asset));
    this.audit.append(audit);
    return Promise.resolve(copy(asset));
  }

  async modify(
    id: string,
    decide: (current: StoredAsset) => AssetModification | null,
  ): Promise<StoredAsset | null> {
    await Promise.resolve();
    const index = this.assets.findIndex((asset) => asset.id === id);
    const current = this.assets[index];
    if (!current) return null;
    const decision = decide(copy(current));
    if (!decision) return copy(current);
    const { ticker } = decision.changes;
    if (ticker !== undefined && this.assets.some((a) => a.id !== id && a.ticker === ticker)) {
      throw new TickerInUseError();
    }
    const updated: StoredAsset = { ...current, ...decision.changes, updatedAt: decision.updatedAt };
    this.assets[index] = updated;
    this.audit.append(decision.audit);
    return copy(updated);
  }
}

function copy(asset: StoredAsset): StoredAsset {
  return { ...asset };
}
