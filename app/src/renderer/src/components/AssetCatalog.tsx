import {
  FREE_COLLECTION_CAPACITY,
  normalizeTicker,
  validateAssetUpdate,
  validateNewAsset,
  type AssetClass,
  type AssetHistory,
  type AssetStatusFilter,
  type AssetUpdateInput,
  type CatalogAsset,
  type CatalogQuery,
  type FieldErrors,
  type SectorCode,
} from '@simulador/shared';
import { CheckCircle, Plus, Warning } from '@phosphor-icons/react';
import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError, ClientResult } from '../../../shared/auth-ipc';
import '../assets.css';
import { formatCalendarDay, formatYears } from '../format';
import { useAssetQuery } from '../useAssetQuery';
import {
  AssetFilters,
  ClassChoice,
  EMPTY_FILTERS,
  hasFilters,
  SectorSelect,
  toSearchQuery,
  useSectorName,
  type AssetFilterState,
} from './AssetFields';
import { SelectField } from './SelectField';
import { TextField } from './TextField';

type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; asset: CatalogAsset };
type NoticeKind = 'created' | 'updated' | 'unchanged' | 'deactivated' | 'reactivated';

const STATUS_OPTIONS: ReadonlyArray<{ value: AssetStatusFilter; label: string }> = [
  { value: 'all', label: 'catalog.statusAll' },
  { value: 'active', label: 'catalog.statusActive' },
  { value: 'inactive', label: 'catalog.statusInactive' },
];

/**
 * Tela "Ativos" da Área do colaborador (SPEC-006 §5.3): busca com filtro de situação, contador
 * com aviso acima de 50 (DA16), cadastro, edição, desativação com confirmação e reativação.
 */
export function AssetCatalog({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { t } = useTranslation();
  const sectorName = useSectorName();
  const [filters, setFilters] = useState<AssetFilterState>(EMPTY_FILTERS);
  const [status, setStatus] = useState<AssetStatusFilter>('all');
  const query: CatalogQuery = { ...toSearchQuery(filters), status };
  const { data, error, loading, reload } = useAssetQuery(
    query,
    window.api.assets.catalog,
    onSessionExpired,
  );
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; ticker: string } | null>(null);
  const [actionError, setActionError] = useState<ClientAuthError>();

  const newButton = useRef<HTMLButtonElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const statusMessage = useRef<HTMLParagraphElement>(null);
  /** Para onde o foco volta quando o formulário fecha sem salvar. */
  const returnFocus = useRef<HTMLElement | null>(null);
  const focusAfterRender = useRef<'status' | 'return' | null>(null);
  const cancelledConfirm = useRef<string | null>(null);

  // Depois de salvar ou mudar a situação, o foco vai para a mensagem (a linha pode até sumir da
  // lista); depois de cancelar, volta para o botão que abriu o formulário.
  useEffect(() => {
    const target = focusAfterRender.current;
    focusAfterRender.current = null;
    if (target === 'status') statusMessage.current?.focus();
    if (target === 'return') {
      const back = returnFocus.current;
      (back?.isConnected ? back : newButton.current)?.focus();
    }
  }, [form, notice]);

  // Confirmação aberta: foco em "Desativar agora". Cancelada: volta para o "Desativar" da linha.
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    const cancelled = cancelledConfirm.current;
    if (!confirming && cancelled) {
      cancelledConfirm.current = null;
      table.current
        ?.querySelector<HTMLButtonElement>(`[data-asset="${cancelled}"] .deactivate-button`)
        ?.focus();
    }
  }, [confirming]);

  const clearMessages = () => {
    setNotice(null);
    setActionError(undefined);
  };

  const finished = (kind: NoticeKind, asset: CatalogAsset) => {
    setNotice({ kind, ticker: asset.ticker });
    focusAfterRender.current = 'status';
    reload();
  };

  const failed = (code: ClientAuthError) => {
    if (code === 'unauthorized') return onSessionExpired();
    setActionError(code);
    // Ativo que sumiu: a lista é recarregada para mostrar o estado de verdade.
    if (code === 'asset_not_found') {
      setForm({ mode: 'closed' });
      reload();
    }
  };

  const openForm = (next: FormState, trigger: HTMLElement) => {
    clearMessages();
    setConfirming(null);
    returnFocus.current = trigger;
    setForm(next);
  };

  const closeForm = () => {
    focusAfterRender.current = 'return';
    setForm({ mode: 'closed' });
  };

  const changeStatus = async (asset: CatalogAsset, active: boolean) => {
    clearMessages();
    setPending(asset.id);
    const result = active
      ? await window.api.assets.reactivate(asset.id)
      : await window.api.assets.deactivate(asset.id);
    setPending(null);
    setConfirming(null);
    if (!result.ok) return failed(result.error);
    finished(active ? 'reactivated' : 'deactivated', result.data);
  };

  const activeCount = data?.activeCount ?? 0;
  const overCapacity = activeCount > FREE_COLLECTION_CAPACITY;
  const yearsWithoutCalendar = data?.historyYearsWithoutCalendar ?? [];
  const filtered = hasFilters(filters) || status !== 'all';

  return (
    <div className="assets-view catalog-view">
      <header className="page-hero page-hero-compact">
        <h1>{t('catalog.title')}</h1>
        <p className="lead">{t('catalog.subtitle')}</p>
      </header>

      <section className="profile-panel assets-panel" aria-label={t('catalog.title')}>
        <div className="catalog-toolbar">
          <div>
            <p className="catalog-count">
              {data ? t('catalog.activeCount', { count: activeCount }) : t('loading')}
            </p>
            {overCapacity && (
              <p className="catalog-capacity">
                <Warning weight="fill" aria-hidden="true" />
                {t('catalog.capacityWarning', { limit: FREE_COLLECTION_CAPACITY })}
              </p>
            )}
            {yearsWithoutCalendar.length > 0 && (
              <p className="catalog-capacity">
                <Warning weight="fill" aria-hidden="true" />
                {t('catalog.historyWaitingCalendar', {
                  years: formatYears(yearsWithoutCalendar),
                })}
              </p>
            )}
          </div>
          <button
            ref={newButton}
            type="button"
            className="pill pill-primary pill-small"
            disabled={form.mode === 'create'}
            onClick={(event) => openForm({ mode: 'create' }, event.currentTarget)}
          >
            {t('catalog.new')}
            <span className="pill-icon" aria-hidden="true">
              <Plus weight="bold" />
            </span>
          </button>
        </div>

        {form.mode !== 'closed' && (
          <AssetForm
            key={form.mode === 'edit' ? form.asset.id : 'novo'}
            asset={form.mode === 'edit' ? form.asset : undefined}
            onSaved={(kind, asset) => {
              // Só o formulário salvo fecha; desativar outro ativo não descarta uma edição aberta.
              setForm({ mode: 'closed' });
              finished(kind, asset);
            }}
            onCancel={closeForm}
            onFailed={failed}
          />
        )}

        <AssetFilters value={filters} onChange={setFilters}>
          <SelectField
            label={t('catalog.statusFilter')}
            value={status}
            onChange={(value) => setStatus(value as AssetStatusFilter)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </SelectField>
        </AssetFilters>

        <div className="assets-summary">
          <p role="status">
            {loading && t('assets.searching')}
            {!loading && data && t('assets.resultCount', { count: data.assets.length })}
          </p>
          {filtered && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setStatus('all');
              }}
            >
              {t('assets.clear')}
            </button>
          )}
        </div>

        {(error ?? actionError) && (
          <p className="form-error" role="alert">
            {t(`authErrors.${actionError ?? error}`)}
          </p>
        )}

        {/* Região sempre presente: o leitor de tela anuncia o que acabou de acontecer. */}
        <p ref={statusMessage} className="form-success" role="status" tabIndex={-1}>
          {notice && (
            <>
              <CheckCircle weight="fill" aria-hidden="true" />
              {t(`catalog.${notice.kind}`, { ticker: notice.ticker })}
            </>
          )}
        </p>

        {data && data.assets.length === 0 && (
          <p className="assets-empty">
            {filtered ? t('catalog.empty') : t('catalog.emptyCatalog')}
          </p>
        )}

        {data && data.assets.length > 0 && (
          <table
            ref={table}
            className="asset-table catalog-table"
            aria-label={t('catalog.listLabel')}
            aria-busy={loading}
          >
            <thead>
              <tr>
                <th scope="col">{t('assets.columns.asset')}</th>
                <th scope="col" className="wide-only">
                  {t('assets.columns.class')}
                </th>
                <th scope="col">{t('assets.columns.sector')}</th>
                <th scope="col">{t('assets.columns.status')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('assets.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.assets.map((asset) => {
                const editing = form.mode === 'edit' && form.asset.id === asset.id;
                const busy = pending === asset.id;
                return (
                  <Fragment key={asset.id}>
                    <tr
                      data-asset={asset.id}
                      className={
                        [asset.active ? '' : 'is-inactive', editing ? 'is-editing' : '']
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      <td>
                        <span className="asset-ticker">{asset.ticker}</span>
                        <span className="asset-name">{asset.name}</span>
                        <HistoryLine history={asset.history} />
                        <span className={`class-badge class-${asset.class} narrow-only`}>
                          {t(`assets.class.${asset.class}`)}
                        </span>
                      </td>
                      <td className="wide-only">
                        <span className={`class-badge class-${asset.class}`}>
                          {t(`assets.class.${asset.class}`)}
                        </span>
                      </td>
                      <td>{sectorName(asset.class, asset.sector)}</td>
                      <td>
                        <span
                          className={
                            asset.active ? 'soon-badge current-badge' : 'soon-badge warn-badge'
                          }
                        >
                          {asset.active ? t('catalog.active') : t('catalog.inactive')}
                        </span>
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="table-action"
                          aria-label={t('catalog.editLabel', { ticker: asset.ticker })}
                          disabled={busy}
                          onClick={(event) =>
                            openForm({ mode: 'edit', asset }, event.currentTarget)
                          }
                        >
                          {t('catalog.edit')}
                        </button>
                        {asset.active ? (
                          <button
                            type="button"
                            className="table-action deactivate-button"
                            aria-label={t('catalog.deactivateLabel', { ticker: asset.ticker })}
                            aria-expanded={confirming === asset.id}
                            disabled={busy}
                            onClick={() => {
                              clearMessages();
                              setConfirming(asset.id);
                            }}
                          >
                            {t('catalog.deactivate')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="table-action"
                            aria-label={t('catalog.reactivateLabel', { ticker: asset.ticker })}
                            disabled={busy}
                            onClick={() => void changeStatus(asset, true)}
                          >
                            {t('catalog.reactivate')}
                          </button>
                        )}
                      </td>
                    </tr>
                    {confirming === asset.id && (
                      <tr className="confirm-row">
                        <td colSpan={5}>
                          <div className="asset-confirm">
                            <p>{t('catalog.deactivateConfirm', { ticker: asset.ticker })}</p>
                            <div className="form-actions">
                              <button
                                ref={confirmButton}
                                type="button"
                                disabled={busy}
                                onClick={() => void changeStatus(asset, false)}
                              >
                                {busy ? t('auth.submitting') : t('catalog.confirmDeactivate')}
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busy}
                                onClick={() => {
                                  cancelledConfirm.current = asset.id;
                                  setConfirming(null);
                                }}
                              >
                                {t('auth.cancel')}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** Situação do histórico de cotações do ativo (SPEC-008 §5.3). */
function HistoryLine({ history }: { history: AssetHistory }) {
  const { t, i18n } = useTranslation();
  if (history.status === 'loaded' && history.from && history.to) {
    return (
      <span className="asset-history">
        {t('catalog.historyLoaded', {
          from: formatCalendarDay(history.from, i18n.language),
          to: formatCalendarDay(history.to, i18n.language),
        })}
      </span>
    );
  }
  if (history.status === 'not_found') {
    return <span className="asset-history is-warn">{t('catalog.historyNotFound')}</span>;
  }
  return <span className="asset-history">{t('catalog.historyPending')}</span>;
}

/**
 * Cadastro e edição. Na edição, a classe aparece só para leitura (RB22) e vai para o servidor só
 * o que mudou; sem mudança, nada é enviado.
 */
function AssetForm({
  asset,
  onSaved,
  onCancel,
  onFailed,
}: {
  asset: CatalogAsset | undefined;
  onSaved: (kind: NoticeKind, asset: CatalogAsset) => void;
  onCancel: () => void;
  onFailed: (code: ClientAuthError) => void;
}) {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState(asset?.ticker ?? '');
  const [name, setName] = useState(asset?.name ?? '');
  const [assetClass, setAssetClass] = useState<AssetClass | ''>(asset?.class ?? '');
  const [sector, setSector] = useState<SectorCode | ''>(asset?.sector ?? '');
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError>();
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = `asset-form-${asset?.id ?? 'novo'}`;

  useEffect(() => {
    formRef.current?.querySelector('input')?.focus();
  }, []);

  const handle = (result: ClientResult<CatalogAsset>, kind: NoticeKind) => {
    if (result.ok) return onSaved(kind, result.data);
    if (result.error === 'unauthorized' || result.error === 'asset_not_found') {
      return onFailed(result.error);
    }
    setError(result.error);
    setFields(result.fields ?? {});
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (!asset) {
      const checked = validateNewAsset({ ticker, name, class: assetClass, sector });
      if (!checked.success) return setFields(checked.fields);
      setFields({});
      setSubmitting(true);
      const result = await window.api.assets.create(checked.data);
      setSubmitting(false);
      return handle(result, 'created');
    }

    const changes: AssetUpdateInput = {};
    if (normalizeTicker(ticker) !== asset.ticker) changes.ticker = ticker;
    if (name.trim() !== asset.name) changes.name = name;
    if (sector !== asset.sector) changes.sector = sector;
    if (Object.keys(changes).length === 0) return onSaved('unchanged', asset);
    const checked = validateAssetUpdate(changes, asset.class);
    if (!checked.success) return setFields(checked.fields);
    setFields({});
    setSubmitting(true);
    const result = await window.api.assets.update(asset.id, checked.data);
    setSubmitting(false);
    handle(result, 'updated');
  };

  const sectorLabel = assetClass ? t(`assets.sectorLabel.${assetClass}`) : t('assets.sectorFilter');

  return (
    <form
      ref={formRef}
      className="asset-form"
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>
        {asset ? t('catalog.editTitle', { ticker: asset.ticker }) : t('catalog.newTitle')}
      </h2>
      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}
      <div className="asset-form-grid">
        <TextField
          label={t('catalog.ticker')}
          type="text"
          value={ticker}
          onChange={(value) => setTicker(value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          hint={t('catalog.tickerHint')}
          error={fields.ticker}
        />
        <TextField
          label={t('catalog.name')}
          type="text"
          value={name}
          onChange={setName}
          autoComplete="off"
          error={fields.name}
        />
      </div>
      <ClassChoice
        legend={t('catalog.class')}
        value={assetClass}
        disabled={asset !== undefined}
        hint={t('catalog.classHint')}
        error={fields.class}
        onChange={(next) => {
          if (!next) return;
          setAssetClass(next);
          if (sector && next !== assetClass) setSector('');
        }}
      />
      <SectorSelect
        label={sectorLabel}
        assetClass={assetClass}
        sector={sector}
        emptyLabel={t('catalog.choose')}
        error={fields.sector}
        onChange={(cls, code) => {
          // Sem classe ainda, escolher um item da lista escolhe a classe dele (só no cadastro).
          if (!asset) setAssetClass(cls);
          setSector(code);
        }}
      />
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? t('auth.submitting') : asset ? t('catalog.save') : t('catalog.create')}
        </button>
        <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>
          {t('auth.cancel')}
        </button>
      </div>
    </form>
  );
}
