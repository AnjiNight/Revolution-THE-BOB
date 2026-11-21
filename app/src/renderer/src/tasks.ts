import type { TaskRunStatus, TaskSchedule } from '@simulador/shared';
import { quoteMoment } from './format';

/** O `t` do i18next; os valores vão sempre (com `exactOptionalPropertyTypes`, "nenhum" é `{}`). */
type Translate = (key: string, values: Record<string, unknown>) => string;

/** SPEC-011: a duração de uma execução, curta: "45 s", "3 min", "1 h 05 min". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * SPEC-011: quando a tarefa roda, no idioma da interface: "Todo dia às 09:00 e 18:00", "A cada
 * 15 minutos", "Aos domingos às 04:00", "A cada 30 minutos durante o pregão".
 */
export function scheduleText(schedule: TaskSchedule, t: Translate, language: string): string {
  switch (schedule.kind) {
    case 'every':
      return t('tasks.schedule.every', { minutes: schedule.minutes });
    case 'session':
      return t('tasks.schedule.session', { minutes: schedule.minutes });
    case 'weekly':
      return t('tasks.schedule.weekly', { times: list(schedule.times, language) });
    case 'daily': {
      const text = t('tasks.schedule.daily', { times: list(schedule.times, language) });
      return schedule.sundaysAll ? `${text} ${t('tasks.schedule.sundaysAll', {})}` : text;
    }
  }
}

/** Os horários ("09:00", de Brasília) no formato do idioma ("09:00 AM" em inglês), em lista. */
function list(times: string[], language: string): string {
  const clock = new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const shown = times.map((time) => {
    const [hour = 0, minute = 0] = time.split(':').map(Number);
    return clock.format(Date.UTC(2000, 0, 1, hour, minute));
  });
  return new Intl.ListFormat(language, { type: 'conjunction' }).format(shown);
}

/** SPEC-011: um momento no horário de Brasília: "hoje às 08:00" ou "15/11 às 08:00". */
export function whenText(iso: string, t: Translate, language: string, now?: Date): string {
  const moment = quoteMoment(iso, language, now);
  return moment.today
    ? t('tasks.at.today', { time: moment.time })
    : t('tasks.at.other', { date: moment.date, time: moment.time });
}

/** SPEC-011: há quanto tempo o processador deu sinal: "há 40 segundos", "há 3 minutos". */
export function sinceText(iso: string, language: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return format.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return format.format(-hours, 'hour');
  return format.format(-Math.round(hours / 24), 'day');
}

/** O tom de cada situação: nunca só a cor, mas a cor ajuda (ok, aviso, erro). */
export function statusTone(status: TaskRunStatus): 'ok' | 'warn' | 'error' {
  if (status === 'sucesso') return 'ok';
  if (status === 'falha') return 'error';
  return 'warn';
}
