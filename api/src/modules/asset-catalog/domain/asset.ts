import type { Asset, AssetClass, CatalogAsset, SectorCode } from '@simulador/shared';

/** Ativo do catálogo como fica guardado (SPEC-006 §6). */
export interface StoredAsset {
  id: string;
  ticker: string;
  name: string;
  /** Nunca muda depois do cadastro (RB22). */
  assetClass: AssetClass;
  sector: SectorCode;
  createdAt: Date;
  updatedAt: Date;
  /** `null`: o ativo está ativo. */
  deactivatedAt: Date | null;
}

export function isActive(asset: StoredAsset): boolean {
  return asset.deactivatedAt === null;
}

/** O que o usuário vê na busca. */
export function toPublicAsset(asset: StoredAsset): Asset {
  return {
    id: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    class: asset.assetClass,
    sector: asset.sector,
  };
}

/** O que o colaborador vê no catálogo. */
export function toCatalogAsset(asset: StoredAsset): CatalogAsset {
  return {
    ...toPublicAsset(asset),
    active: isActive(asset),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deactivatedAt: asset.deactivatedAt?.toISOString() ?? null,
  };
}
