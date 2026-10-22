import {
  CALENDAR_MAX_YEAR,
  CALENDAR_MIN_YEAR,
  isIsoDate,
  isoDateInBrasilia,
  nonTradingDayField,
  validateCalendarPublication,
  yearOf,
  type FieldErrorCode,
  type FieldErrors,
  type NonTradingDay,
  type TradingCalendarYear,
} from '@simulador/shared';
import { CheckCircle, Info, Plus, Sparkle, Trash } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientAuthError } from '../../../shared/auth-ipc';
import '../calendar.css';
import { formatCalendarDay, formatDate, formatWeekday } from '../format';
import { TextField } from './TextField';

/** Dia da lista em edição; `suggested` marca o que veio da sugestão e ainda não foi publicado. */
interface DraftDay extends NonTradingDay {
  suggested?: boolean;
}

/** Erros do dia que se tenta adicionar. */
interface DayErrors {
  date?: FieldErrorCode | undefined;
  reason?: FieldErrorCode | undefined;
}

const YEARS = Array.from(
  { length: CALENDAR_MAX_YEAR - CALENDAR_MIN_YEAR + 1 },
  (_, index) => CALENDAR_MIN_YEAR + index,
);

const byDate = (a: NonTradingDay, b: NonTradingDay) => a.date.localeCompare(b.date);

interface TradingCalendarProps {
  /** Ano aberto ao entrar; padrão: o ano atual em Brasília. */
  initialYear?: number | undefined;
  onSessionExpired: () => void;
}

/**
 * Tela "Calendário de pregão" da Área do colaborador (SPEC-005 §5.3): escolhe o ano, carrega a
 * sugestão, confere com a B3, ajusta a lista e publica com confirmação.
 */
export function TradingCalendar({ initialYear, onSessionExpired }: TradingCalendarProps) {
  const { t, i18n } = useTranslation();
  const yearId = useId();
  const [year, setYear] = useState(() => initialYear ?? yearOf(isoDateInBrasilia(new Date())));
  const [saved, setSaved] = useState<TradingCalendarYear | null>(null);
  const [days, setDays] = useState<DraftDay[]>([]);
  const [dirty, setDirty] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<ClientAuthError>();
  const [notice, setNotice] = useState<'suggestion' | 'published' | null>(null);
  const [busy, setBusy] = useState<'loading' | 'suggestion' | 'publishing' | null>('loading');
  const [confirming, setConfirming] = useState(false);
  const publishButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const statusMessage = useRef<HTMLParagraphElement>(null);
  const suggestionButton = useRef<HTMLButtonElement>(null);
  const table = useRef<HTMLTableElement>(null);
  /** Linha que acabou de ser removida: o foco vai para a que tomou o lugar dela. */
  const removedRow = useRef<number | null>(null);

  const showSaved = (calendar: TradingCalendarYear) => {
    setSaved(calendar);
    setDays(calendar.nonTradingDays);
    setDirty(false);
  };

  const fail = (code: ClientAuthError) => {
    if (code === 'unauthorized') return onSessionExpired();
    setError(code);
  };

  useEffect(() => {
    let current = true;
    void window.api.calendar.getYear(year).then((result) => {
      if (!current) return;
      setBusy(null);
      if (!result.ok) {
        if (result.error === 'unauthorized') return onSessionExpired();
        return setError(result.error);
      }
      setSaved(result.data);
      setDays(result.data.nonTradingDays);
      setDirty(false);
    });
    return () => {
      current = false;
    };
  }, [year, onSessionExpired]);

  // Confirmação aberta: foco em "Publicar agora". Fechada: volta para "Publicar {ano}" ou, se ele
  // ficou desativado porque o ano acabou de ser publicado, para a mensagem de sucesso.
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (wasConfirming.current) {
      const back = publishButton.current;
      if (back && !back.disabled) back.focus();
      else statusMessage.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  // Dia removido: foco no "Remover" da linha seguinte (ou da última); lista vazia, na sugestão.
  useEffect(() => {
    const row = removedRow.current;
    if (row === null) return;
    removedRow.current = null;
    const buttons = table.current?.querySelectorAll<HTMLButtonElement>(
      '.calendar-row-actions button',
    );
    const next = buttons?.[Math.min(row, buttons.length - 1)];
    (next ?? suggestionButton.current)?.focus();
  }, [days]);

  const resetMessages = () => {
    setError(undefined);
    setFields({});
    setNotice(null);
    setConfirming(false);
  };

  const changeYear = (next: number) => {
    resetMessages();
    setSaved(null);
    setDays([]);
    setBusy('loading');
    setYear(next);
  };

  const edit = (next: DraftDay[]) => {
    resetMessages();
    setDays(next);
    setDirty(true);
  };

  const loadSuggestion = async () => {
    resetMessages();
    setBusy('suggestion');
    const result = await window.api.calendar.suggestion(year);
    setBusy(null);
    if (!result.ok) return fail(result.error);
    setDays(result.data.nonTradingDays.map((day) => ({ ...day, suggested: true })));
    setDirty(true);
    setNotice('suggestion');
  };

  /** Valida o dia novo junto com a lista (repetido, fim de semana, outro ano) e devolve os erros dele. */
  const addDay = (day: NonTradingDay): DayErrors => {
    const next = [...days, day];
    const checked = validateCalendarPublication(year, { nonTradingDays: next });
    if (!checked.success) {
      const index = next.length - 1;
      const own = {
        date: checked.fields[nonTradingDayField(index, 'date')],
        reason: checked.fields[nonTradingDayField(index, 'reason')],
      };
      if (own.date || own.reason) return own;
    }
    edit([...days, { date: day.date.trim(), reason: day.reason.trim() }].sort(byDate));
    return {};
  };

  const startPublishing = () => {
    const checked = validateCalendarPublication(year, { nonTradingDays: days });
    resetMessages();
    if (!checked.success) {
      setFields(checked.fields);
      setError('validation_error');
      return;
    }
    setConfirming(true);
  };

  const publish = async () => {
    setBusy('publishing');
    const result = await window.api.calendar.publish(year, {
      nonTradingDays: days.map(({ date, reason }) => ({ date, reason })),
    });
    setBusy(null);
    setConfirming(false);
    if (!result.ok) {
      setFields(result.fields ?? {});
      return fail(result.error);
    }
    showSaved(result.data);
    setNotice('published');
  };

  const dayError = (index: number) =>
    fields[nonTradingDayField(index, 'date')] ?? fields[nonTradingDayField(index, 'reason')];

  const canPublish = saved !== null && (dirty || !saved.published) && busy === null;

  return (
    <div className="calendar-view">
      <header className="page-hero page-hero-compact">
        <h1>{t('calendar.title')}</h1>
        <p className="lead">{t('calendar.subtitle')}</p>
      </header>

      <section className="profile-panel calendar-panel" aria-labelledby="calendar-list-title">
        <div className="calendar-toolbar">
          <div className="calendar-year">
            <label htmlFor={yearId}>{t('calendar.year')}</label>
            <select
              id={yearId}
              value={year}
              disabled={dirty || busy !== null}
              aria-describedby={dirty ? `${yearId}-locked` : undefined}
              onChange={(event) => changeYear(Number(event.target.value))}
            >
              {YEARS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          {saved && (
            <span
              className={saved.published ? 'soon-badge current-badge' : 'soon-badge warn-badge'}
            >
              {saved.published && saved.publishedAt
                ? t('calendar.published', {
                    date: formatDate(saved.publishedAt, i18n.language, true),
                  })
                : t('calendar.notPublished')}
            </span>
          )}
        </div>

        {dirty && (
          <div className="calendar-unsaved">
            <p id={`${yearId}-locked`}>
              {t('calendar.unsaved')} {t('calendar.yearLocked')}
            </p>
            <button
              type="button"
              className="pill pill-ghost pill-small"
              disabled={busy !== null || saved === null}
              onClick={() => {
                resetMessages();
                if (saved) showSaved(saved);
              }}
            >
              {t('calendar.discard')}
            </button>
          </div>
        )}

        <p className="calendar-note">
          <Info weight="fill" aria-hidden="true" />
          {t('calendar.b3Note')}
        </p>

        {error && (
          <p className="form-error" role="alert">
            {t(`authErrors.${error}`)}
          </p>
        )}

        <div className="calendar-list-head">
          <div>
            <h2 id="calendar-list-title">{t('calendar.listTitle', { year })}</h2>
            {saved && (
              <p className="profile-value">{t('calendar.count', { count: days.length })}</p>
            )}
          </div>
          <button
            ref={suggestionButton}
            type="button"
            className="pill pill-ghost pill-small"
            disabled={busy !== null || saved === null}
            onClick={() => void loadSuggestion()}
          >
            {busy === 'suggestion' ? t('auth.submitting') : t('calendar.loadSuggestion')}
            <span className="pill-icon" aria-hidden="true">
              <Sparkle weight="bold" />
            </span>
          </button>
        </div>

        {busy === 'loading' && <p className="loading">{t('loading')}</p>}

        {saved && days.length === 0 && <p className="calendar-empty">{t('calendar.empty')}</p>}

        {saved && days.length > 0 && (
          <table ref={table} className="calendar-table">
            <thead>
              <tr>
                <th scope="col">{t('calendar.date')}</th>
                <th scope="col">{t('calendar.reason')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('calendar.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, index) => {
                const problem = dayError(index);
                const label = isIsoDate(day.date)
                  ? formatCalendarDay(day.date, i18n.language)
                  : day.date;
                return (
                  <tr key={`${day.date}-${index}`} className={problem ? 'has-error' : undefined}>
                    <td>
                      <span className="calendar-date">{label}</span>
                      {isIsoDate(day.date) && (
                        <span className="calendar-weekday">
                          {formatWeekday(day.date, i18n.language)}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="calendar-reason">{day.reason}</span>
                      {day.suggested && (
                        <span className="soon-badge suggestion-badge">
                          {t('calendar.suggested')}
                        </span>
                      )}
                      {problem && (
                        <span className="field-error">{t(`fieldErrors.${problem}`)}</span>
                      )}
                    </td>
                    <td className="calendar-row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t('calendar.removeLabel', { date: label, reason: day.reason })}
                        title={t('calendar.remove')}
                        disabled={busy !== null}
                        onClick={() => {
                          removedRow.current = index;
                          edit(days.filter((_, other) => other !== index));
                        }}
                      >
                        <Trash weight="bold" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {saved && <p className="field-hint calendar-weekend-note">{t('calendar.weekendNote')}</p>}

        {saved && <AddDayForm year={year} disabled={busy !== null} onAdd={addDay} />}

        <div className="calendar-publish">
          {confirming ? (
            <div className="calendar-confirm">
              <p>{t('calendar.confirmText')}</p>
              <div className="form-actions">
                <button
                  ref={confirmButton}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void publish()}
                >
                  {busy === 'publishing' ? t('auth.submitting') : t('calendar.confirm')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy !== null}
                  onClick={() => setConfirming(false)}
                >
                  {t('auth.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              ref={publishButton}
              type="button"
              className="pill pill-primary"
              disabled={!canPublish}
              onClick={startPublishing}
            >
              {t('calendar.publish', { year })}
            </button>
          )}
        </div>

        {/* Região sempre presente: o leitor de tela anuncia quando a confirmação aparece. */}
        <p ref={statusMessage} className="form-success" role="status" tabIndex={-1}>
          {notice && (
            <>
              <CheckCircle weight="fill" aria-hidden="true" />
              {notice === 'published'
                ? t('calendar.publishedOk', { year })
                : t('calendar.suggestionLoaded')}
            </>
          )}
        </p>
      </section>
    </div>
  );
}

/** Data (dentro do ano) e motivo. Os erros aparecem nos próprios campos. */
function AddDayForm({
  year,
  disabled,
  onAdd,
}: {
  year: number;
  disabled: boolean;
  onAdd: (day: NonTradingDay) => DayErrors;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<DayErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problems = onAdd({ date, reason });
    setErrors(problems);
    if (!problems.date && !problems.reason) {
      setDate('');
      setReason('');
    }
  };

  return (
    <form
      className="calendar-add"
      onSubmit={submit}
      noValidate
      aria-labelledby="calendar-add-title"
    >
      <h3 id="calendar-add-title">{t('calendar.addTitle')}</h3>
      <div className="calendar-add-fields">
        <TextField
          label={t('calendar.date')}
          type="date"
          value={date}
          onChange={setDate}
          autoComplete="off"
          min={`${year}-01-01`}
          max={`${year}-12-31`}
          error={errors.date}
        />
        <TextField
          label={t('calendar.reason')}
          type="text"
          value={reason}
          onChange={setReason}
          autoComplete="off"
          hint={t('calendar.reasonHint')}
          error={errors.reason}
        />
        <button type="submit" className="secondary calendar-add-button" disabled={disabled}>
          <Plus weight="bold" aria-hidden="true" />
          {t('calendar.add')}
        </button>
      </div>
    </form>
  );
}
