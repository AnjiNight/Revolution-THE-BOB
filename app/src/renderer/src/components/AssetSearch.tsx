import type { Asset, AssetSearchQuery } from '@simulador/shared';
import { Info } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../assets.css';
import { useAssetQuery } from '../useAssetQuery';
import {
  AssetFilters,
  EMPTY_FILTERS,
  hasFilters,
  toSearchQuery,
  useSectorName,
  type AssetFilterState,
} from './AssetFields';

/**
 * Tela "Ativos" do usuário (SPEC-006 §5.3): busca por ticker ou nome e filtros de classe e de
 * setor ou segmento, só nos ativos ativos do catálogo da equipe (OPEN-41).
 */
export function AssetSearch({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<AssetFilterState>(EMPTY_FILTERS);
  const query: AssetSearchQuery = toSearchQuery(filters);
  const { data, error, loading } = useAssetQuery(query, window.api.assets.search, onSessionExpired);
  const filtered = hasFilters(filters);

  return (
    <div className="assets-view">
      <header className="page-hero page-hero-compact">
        <h1>{t('assets.title')}</h1>
        <p className="lead">{t('assets.subtitle')}</p>
      </header>

      <section className="profile-panel assets-panel" aria-label={t('assets.title')}>
        <AssetFilters value={filters} onChange={setFilters} />

        <div className="assets-summary">
          <p role="status">
            {loading && t('assets.searching')}
            {!loading && data && t('assets.resultCount', { count: data.assets.length })}
          </p>
          {filtered && (
            <button type="button" className="link" onClick={() => setFilters(EMPTY_FILTERS)}>
              {t('assets.clear')}
            </button>
          )}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {t(`authErrors.${error}`)}
          </p>
        )}

        {data && data.assets.length === 0 && (
          <p className="assets-empty">{filtered ? t('assets.empty') : t('assets.emptyCatalog')}</p>
        )}
        {data && data.assets.length > 0 && <AssetTable assets={data.assets} busy={loading} />}
        {data?.hasMore && <p className="field-hint">{t('assets.hasMore')}</p>}

        <p className="assets-note">
          <Info weight="fill" aria-hidden="true" />
          {t('assets.catalogNote')}
        </p>
      </section>
    </div>
  );
}

/** Ticker e nome, classe e setor ou segmento. */
function AssetTable({ assets, busy }: { assets: Asset[]; busy: boolean }) {
  const { t } = useTranslation();
  const sectorName = useSectorName();
  return (
    <table className="asset-table" aria-label={t('assets.listLabel')} aria-busy={busy}>
      <thead>
        <tr>
          <th scope="col">{t('assets.columns.asset')}</th>
          <th scope="col">{t('assets.columns.class')}</th>
          <th scope="col">{t('assets.columns.sector')}</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((asset) => (
          <tr key={asset.id}>
            <td>
              <span className="asset-ticker">{asset.ticker}</span>
              <span className="asset-name">{asset.name}</span>
            </td>
            <td>
              <span className={`class-badge class-${asset.class}`}>
                {t(`assets.class.${asset.class}`)}
              </span>
            </td>
            <td>{sectorName(asset.class, asset.sector)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
