import { describe, expect, it } from 'vitest';
import { formatDuration, scheduleText, sinceText, statusTone, whenText } from './tasks';

/** Tradução de mentira: devolve a chave com os valores, para conferir o que foi pedido. */
const t = (key: string, values: Record<string, unknown>) =>
  Object.keys(values).length > 0 ? `${key} ${JSON.stringify(values)}` : key;

describe('tela Tarefas (SPEC-011)', () => {
  it('duração curta', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(59_400)).toBe('59 s');
    expect(formatDuration(180_000)).toBe('3 min');
    expect(formatDuration(65 * 60_000)).toBe('1 h 05 min');
    expect(formatDuration(-5)).toBe('0 s');
  });

  it('quando a tarefa roda, com os horários juntos no idioma', () => {
    expect(scheduleText({ kind: 'daily', times: ['09:00', '18:00'] }, t, 'pt-BR')).toBe(
      'tasks.schedule.daily {"times":"09:00 e 18:00"}',
    );
    // Em inglês, com AM e PM (o espaço antes deles é o estreito do Intl).
    expect(scheduleText({ kind: 'daily', times: ['09:00', '18:00'] }, t, 'en')).toMatch(
      /^tasks\.schedule\.daily \{"times":"09:00\sAM and 06:00\sPM"\}$/u,
    );
    expect(scheduleText({ kind: 'daily', times: ['03:00'], sundaysAll: true }, t, 'pt-BR')).toBe(
      'tasks.schedule.daily {"times":"03:00"} tasks.schedule.sundaysAll',
    );
    expect(scheduleText({ kind: 'every', minutes: 15 }, t, 'pt-BR')).toBe(
      'tasks.schedule.every {"minutes":15}',
    );
    expect(scheduleText({ kind: 'weekly', times: ['04:00'] }, t, 'pt-BR')).toBe(
      'tasks.schedule.weekly {"times":"04:00"}',
    );
    expect(scheduleText({ kind: 'session', minutes: 30 }, t, 'pt-BR')).toBe(
      'tasks.schedule.session {"minutes":30}',
    );
  });

  it('há quanto tempo o processador deu sinal', () => {
    const now = new Date('2026-11-16T13:00:40Z');
    expect(sinceText('2026-11-16T13:00:00Z', 'pt-BR', now)).toBe('há 40 segundos');
    expect(sinceText('2026-11-16T12:57:40Z', 'pt-BR', now)).toBe('há 3 minutos');
    expect(sinceText('2026-11-16T13:00:00Z', 'en', now)).toBe('40 seconds ago');
    expect(sinceText('2026-11-16T10:00:40Z', 'en', now)).toBe('3 hours ago');
  });

  it('quando, no horário de Brasília', () => {
    const now = new Date('2026-11-16T23:30:00Z'); // 20:30 em Brasília
    expect(whenText('2026-11-16T17:05:00Z', t, 'pt-BR', now)).toBe(
      'tasks.at.today {"time":"14:05"}',
    );
    // 01:30 do dia 16 em UTC ainda é dia 15 em Brasília.
    expect(whenText('2026-11-16T01:30:00Z', t, 'pt-BR', now)).toBe(
      'tasks.at.other {"date":"15/11","time":"22:30"}',
    );
  });

  it('o tom de cada situação', () => {
    expect(statusTone('sucesso')).toBe('ok');
    expect(statusTone('falha')).toBe('error');
    expect(statusTone('parcial')).toBe('warn');
    expect(statusTone('cota_esgotada')).toBe('warn');
    expect(statusTone('aguardando_publicacao')).toBe('warn');
  });
});
