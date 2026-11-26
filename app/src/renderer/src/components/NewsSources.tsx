import {
  CALENDAR_TIME_ZONE,
  NEWS_CATEGORIES,
  NEWS_SOURCE_PROBLEM_AFTER,
  SUGGESTED_NEWS_SOURCES,
  validateNewNewsSource,
  type FieldErrors,
  type LatestNews,
  type NewsCategory,
  type NewsSource,
  type NewsSourcesStatus,
} from '@simulador/shared';
import { Info, Plus, Warning } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import { SentimentPanel } from './NewsSentiment';
import { SelectField } from './SelectField';
import { TextField } from './TextField';

type SourcesState =
  | { status: 'loading' }
  | { status: 'ready'; data: NewsSourcesStatus }
  | { status: 'failed'; error: ClientAuthError };

/**
 * Fontes de notícias (SPEC-027 §5.2), na Área do colaborador: a fonte pai no topo, as curadas com
 * a última coleta e quantas notícias há, o andamento do arquivo do Investidor10 e o formulário de
 * nova fonte (o servidor testa o feed antes de gravar).
 */
export function NewsSources({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const [state, setState] = useState<SourcesState>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void window.api.news.sources().then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [onSessionExpired, version]);

  const toggle = async (source: NewsSource) => {
    setBusy(source.id);
    setNotice(null);
    const result = await window.api.news.updateSource(source.id, { active: !source.active });
    setBusy(null);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      return setNotice(t(`authErrors.${result.error}`));
    }
    setNotice(
      t(result.data.source.active ? 'news.activated' : 'news.deactivated', {
        name: result.data.source.name,
      }),
    );
    setVersion((v) => v + 1);
  };

  const closeForm = () => {
    setCreating(false);
    requestAnimationFrame(() => newButton.current?.focus());
  };

  const data = state.status === 'ready' ? state.data : null;
  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: CALENDAR_TIME_ZONE,
    }).format(new Date(iso));
  const number = (value: number) => new Intl.NumberFormat(language).format(value);

  return (
    <div className="page news-sources-page">
      <header className="page-hero">
        <h1 id={titleId}>{t('news.title')}</h1>
        <p>{t('news.subtitle')}</p>
      </header>

      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('news.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}

      {data && (
        <section className="profile-panel" aria-labelledby={titleId}>
          {!data.parentEnabled && (
            <p className="assets-note">
              <Info weight="fill" aria-hidden="true" />
              <span>{t('news.parentDisabled')}</span>
            </p>
          )}
          {data.archive && (
            <p className="field-hint">
              {t(data.archive.status === 'finished' ? 'news.archiveDone' : 'news.archiveRunning', {
                done: number(data.archive.done),
                total: number(data.archive.total),
                date: dateTime(data.archive.updatedAt),
              })}
            </p>
          )}

          {notice && (
            <p className="form-success" role="status">
              {notice}
            </p>
          )}

          <div className="positions-scroll">
            {/* Como as posições: abaixo de 860 px, cada fonte vira um cartão. */}
            <table className="cash-statement positions-table news-sources-table">
              <caption className="visually-hidden">{t('news.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('news.columns.source')}</th>
                  <th scope="col">{t('news.columns.category')}</th>
                  <th scope="col">{t('news.columns.reliability')}</th>
                  <th scope="col">{t('news.columns.lastRun')}</th>
                  <th scope="col" className="cash-number">
                    {t('news.columns.news')}
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">{t('news.columns.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((source) => (
                  <tr key={source.id} className={source.active ? undefined : 'is-reversed'}>
                    <td data-label={t('news.columns.source')}>
                      <span className="cash-type">{source.name}</span>
                      <span className="position-name">{source.url}</span>
                      {source.kind === 'parent' && (
                        <span className="position-event">{t('news.parentNote')}</span>
                      )}
                      {!source.active && (
                        <span className="position-event">{t('news.inactive')}</span>
                      )}
                    </td>
                    <td data-label={t('news.columns.category')}>
                      {source.category ? t(`news.categories.${source.category}`) : '—'}
                    </td>
                    <td data-label={t('news.columns.reliability')}>
                      {source.reliability
                        ? t('news.reliabilityValue', { value: source.reliability })
                        : '—'}
                    </td>
                    <td data-label={t('news.columns.lastRun')}>
                      {source.lastRunAt ? (
                        <span>
                          {dateTime(source.lastRunAt)}
                          <span className="position-name">
                            {t(source.lastStatus === 'failure' ? 'news.failed' : 'news.ok')}
                          </span>
                        </span>
                      ) : (
                        t('news.never')
                      )}
                      {source.failures >= NEWS_SOURCE_PROBLEM_AFTER && (
                        <span className="position-event is-warning">
                          <Warning weight="fill" aria-hidden="true" />{' '}
                          {t('news.problem', { count: source.failures })}
                        </span>
                      )}
                      {source.lastStatus === 'failure' && source.lastError && (
                        <span className="position-name">{source.lastError}</span>
                      )}
                    </td>
                    <td data-label={t('news.columns.news')} className="cash-number">
                      {number(source.news)}
                      {/* SPEC-047: as repetidas de outra fonte ficam guardadas, fora das contagens. */}
                      {source.duplicates > 0 && (
                        <span className="position-name">
                          {t('news.duplicates', { count: source.duplicates })}
                        </span>
                      )}
                    </td>
                    <td data-label="" className="position-actions">
                      {source.kind === 'curated' && (
                        <button
                          type="button"
                          className="pill pill-ghost pill-small"
                          disabled={busy !== null}
                          aria-label={t(
                            source.active ? 'news.deactivateLabel' : 'news.activateLabel',
                            {
                              name: source.name,
                            },
                          )}
                          onClick={() => void toggle(source)}
                        >
                          {t(source.active ? 'news.deactivate' : 'news.activate')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!creating && (
            <button
              ref={newButton}
              type="button"
              className="pill pill-primary"
              onClick={() => {
                setNotice(null);
                setCreating(true);
              }}
            >
              {t('news.new')}
              <span className="pill-icon" aria-hidden="true">
                <Plus weight="bold" />
              </span>
            </button>
          )}
          {creating && (
            <NewSourceForm
              registered={state.status === 'ready' ? state.data.sources.map((s) => s.url) : []}
              onCreated={(name, items) => {
                setNotice(t('news.created', { name, count: items }));
                setVersion((v) => v + 1);
                closeForm();
              }}
              onCancel={closeForm}
              onSessionExpired={onSessionExpired}
            />
          )}
        </section>
      )}

      {data && <LatestNewsList onSessionExpired={onSessionExpired} />}
      {data && <SentimentPanel onSessionExpired={onSessionExpired} />}
    </div>
  );
}

type LatestState =
  | { status: 'loading' }
  | { status: 'ready'; data: LatestNews }
  | { status: 'failed'; error: ClientAuthError };

/**
 * SPEC-028 §5.2: as 20 últimas notícias com os ativos vinculados, para o colaborador conferir a
 * coleta e o vínculo. O título abre a matéria no navegador do sistema.
 */
function LatestNewsList({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const titleId = useId();
  const [state, setState] = useState<LatestState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void window.api.news.latest().then((result) => {
      if (!active) return;
      if (!result.ok && result.error === 'unauthorized') return onSessionExpired();
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [onSessionExpired]);

  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: CALENDAR_TIME_ZONE,
    }).format(new Date(iso));

  return (
    <section className="profile-panel latest-news" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('news.latest.title')}</h2>
      {state.status === 'loading' && (
        <p className="loading" role="status">
          {t('news.latest.loading')}
        </p>
      )}
      {state.status === 'failed' && (
        <p className="form-error" role="alert">
          {t(`authErrors.${state.error}`)}
        </p>
      )}
      {state.status === 'ready' && state.data.news.length === 0 && (
        <p className="assets-empty">{t('news.latest.empty')}</p>
      )}
      {state.status === 'ready' && state.data.news.length > 0 && (
        <>
          <p className="field-hint">
            {t('news.latest.linked', {
              linked: number(state.data.linked),
              total: number(state.data.total),
            })}
          </p>
          <ol className="latest-news-list">
            {state.data.news.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
                <span className="position-name">
                  {item.source} · {dateTime(item.publishedAt)}
                </span>
                {item.links.length > 0 ? (
                  <ul className="news-links" aria-label={t('news.latest.assets')}>
                    {item.links.map((link) => (
                      <li key={link.ticker} className={`news-link is-${link.relevance}`}>
                        {link.ticker}
                        <span className="visually-hidden">
                          {' '}
                          ({t(`news.latest.relevance.${link.relevance}`)})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="position-name">{t('news.latest.noLinks')}</span>
                )}
              </li>
            ))}
          </ol>
          <p className="field-hint news-links-legend">
            <span className="news-link is-principal">{t('news.latest.relevance.principal')}</span>
            <span className="news-link is-citado">{t('news.latest.relevance.citado')}</span>
            <span className="news-link is-lista">{t('news.latest.relevance.lista')}</span>
          </p>
        </>
      )}
    </section>
  );
}

function NewSourceForm({
  registered,
  onCreated,
  onCancel,
  onSessionExpired,
}: {
  /** SPEC-047: os endereços já cadastrados, que saem das sugestões. */
  registered: readonly string[];
  onCreated: (name: string, items: number) => void;
  onCancel: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const licenseId = useId();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://');
  const [category, setCategory] = useState<NewsCategory | ''>('');
  const [reliability, setReliability] = useState('');
  const [license, setLicense] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError | null>(null);
  const [saving, setSaving] = useState(false);
  const suggestions = SUGGESTED_NEWS_SOURCES.filter((s) => !registered.includes(s.url));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const input = {
      name,
      url,
      category,
      reliability: reliability ? Number(reliability) : '',
      licenseChecked: license,
    };
    const checked = validateNewNewsSource(input);
    if (!checked.success) return setFields(checked.fields);
    setFields({});
    setSaving(true);
    const result = await window.api.news.createSource(checked.data);
    setSaving(false);
    if (!result.ok) {
      if (result.error === 'unauthorized') return onSessionExpired();
      if (result.fields) return setFields(result.fields);
      return setError(result.error);
    }
    onCreated(result.data.source.name, result.data.items);
  };

  return (
    <form
      className="news-source-form"
      aria-labelledby={formId}
      onSubmit={(e) => void submit(e)}
      noValidate
    >
      <h2 id={formId}>{t('news.newTitle')}</h2>
      {/* SPEC-047: feeds testados; o clique preenche, e a licença continua com o colaborador. */}
      {suggestions.length > 0 && (
        <div className="news-suggestions">
          <p className="field-hint">{t('news.suggestions')}</p>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.url}>
                <button
                  type="button"
                  className="pill pill-ghost pill-small"
                  aria-pressed={url === suggestion.url}
                  onClick={() => {
                    setName(suggestion.name);
                    setUrl(suggestion.url);
                    setCategory(suggestion.category);
                  }}
                >
                  {suggestion.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <TextField
        label={t('news.fields.name')}
        type="text"
        value={name}
        onChange={setName}
        autoComplete="off"
        error={fields.name}
      />
      <TextField
        label={t('news.fields.url')}
        type="text"
        value={url}
        onChange={setUrl}
        autoComplete="url"
        hint={t('news.fields.urlHint')}
        error={fields.url}
      />
      <SelectField
        label={t('news.fields.category')}
        value={category}
        onChange={(value) => setCategory(value as NewsCategory | '')}
        error={fields.category}
      >
        <option value="">{t('news.fields.choose')}</option>
        {NEWS_CATEGORIES.map((code) => (
          <option key={code} value={code}>
            {t(`news.categories.${code}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('news.fields.reliability')}
        value={reliability}
        onChange={setReliability}
        hint={t('news.fields.reliabilityHint')}
        error={fields.reliability}
      >
        <option value="">{t('news.fields.choose')}</option>
        {[5, 4, 3, 2, 1].map((value) => (
          <option key={value} value={String(value)}>
            {t('news.reliabilityValue', { value })}
          </option>
        ))}
      </SelectField>
      <div className="checkbox">
        <input
          id={licenseId}
          type="checkbox"
          checked={license}
          onChange={(event) => setLicense(event.target.checked)}
          aria-invalid={fields.licenseChecked ? true : undefined}
        />
        <label htmlFor={licenseId}>{t('news.fields.license')}</label>
      </div>
      {fields.licenseChecked && (
        <p className="field-error">{t(`fieldErrors.${fields.licenseChecked}`)}</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {t(`authErrors.${error}`)}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="pill pill-primary" disabled={saving}>
          {saving ? t('news.testing') : t('news.save')}
        </button>
        <button type="button" className="pill pill-ghost" onClick={onCancel}>
          {t('news.cancel')}
        </button>
      </div>
    </form>
  );
}
