import {
  AUTH_PATHS,
  CALENDAR_PATHS,
  calendarPath,
  type AuthSession,
  type CalendarSuggestion,
  type TradingCalendarYear,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { CalendarNotPublishedError } from '../../financial-calculation/trading-calendar.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const NOW = new Date('2026-10-22T15:00:00Z');

describe('rotas do calendário de pregão (SPEC-005)', () => {
  let t: TestApp;
  let collaborator: AuthSession;
  let user: AuthSession;

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => NOW });
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'Nicoly', email: 'nicoly@equipe.com' },
      () => 'senha-do-colaborador',
    );
    const login = await t.app.inject({
      method: 'POST',
      url: AUTH_PATHS.collaboratorLogin,
      payload: { email: 'nicoly@equipe.com', password: 'senha-do-colaborador' },
    });
    collaborator = login.json<AuthSession>();
    user = await t.registerConfirmed();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (
    method: 'GET' | 'PUT',
    url: string,
    session: AuthSession | null,
    payload?: unknown,
  ) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });

  const publish = (year: number, nonTradingDays: unknown, session = collaborator) =>
    call('PUT', calendarPath(CALENDAR_PATHS.publish, year), session, { nonTradingDays });

  it('ano não publicado: published false e lista vazia (CA07)', async () => {
    const res = await call('GET', calendarPath(CALENDAR_PATHS.year, 2026), user);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      year: 2026,
      published: false,
      publishedAt: null,
      nonTradingDays: [],
    });
  });

  it('colaborador carrega a sugestão do ano', async () => {
    const res = await call('GET', calendarPath(CALENDAR_PATHS.suggestion, 2026), collaborator);
    expect(res.statusCode).toBe(200);
    const suggestion = res.json<CalendarSuggestion>();
    expect(suggestion.year).toBe(2026);
    expect(suggestion.nonTradingDays).toHaveLength(14);
    expect(suggestion.nonTradingDays[1]).toEqual({ date: '2026-02-16', reason: 'Carnaval' });
  });

  it('publica, registra quando e por quem, e republicar substitui a lista (CA04)', async () => {
    const first = await publish(2026, [
      { date: '2026-12-25', reason: 'Natal' },
      { date: '2026-01-01', reason: 'Confraternização Universal' },
    ]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      year: 2026,
      published: true,
      publishedAt: NOW.toISOString(),
      nonTradingDays: [
        { date: '2026-01-01', reason: 'Confraternização Universal' },
        { date: '2026-12-25', reason: 'Natal' },
      ],
    });
    expect(t.calendars.years.get(2026)?.publishedBy).toBe(collaborator.user.id);

    await publish(2026, [{ date: '2026-02-16', reason: 'Carnaval' }]);
    const seen = await call('GET', calendarPath(CALENDAR_PATHS.year, 2026), user);
    expect(seen.json<TradingCalendarYear>().nonTradingDays).toEqual([
      { date: '2026-02-16', reason: 'Carnaval' },
    ]);
  });

  it('aponta o problema de cada dia com validation_error (CA05)', async () => {
    const res = await publish(2026, [
      { date: '2026-04-03', reason: 'Sexta-feira Santa' },
      { date: '2026-10-24', reason: 'Sábado' },
      { date: '2027-01-01', reason: 'Outro ano' },
      { date: '2026-04-03', reason: 'Repetido' },
      { date: '2026-06-04', reason: '  ' },
    ]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'validation_error',
      fields: {
        'nonTradingDays.1.date': 'weekend',
        'nonTradingDays.2.date': 'wrong_year',
        'nonTradingDays.3.date': 'duplicate',
        'nonTradingDays.4.reason': 'required',
      },
    });
    expect(t.calendars.years.size).toBe(0);
  });

  it('usuário recebe 403 nas rotas do colaborador, antes de qualquer validação (CA06)', async () => {
    const suggestion = await call('GET', calendarPath(CALENDAR_PATHS.suggestion, 2026), user);
    expect(suggestion.statusCode).toBe(403);
    expect(suggestion.json()).toMatchObject({ error: 'forbidden' });

    const invalid = await publish(2026, 'lista inválida', user);
    expect(invalid.statusCode).toBe(403);
    const valid = await publish(2026, [{ date: '2026-01-01', reason: 'Ano novo' }], user);
    expect(valid.statusCode).toBe(403);
    expect(t.calendars.years.size).toBe(0);
  });

  it('sem sessão, 401 em todas as rotas', async () => {
    for (const [method, path] of [
      ['GET', CALENDAR_PATHS.year],
      ['GET', CALENDAR_PATHS.suggestion],
      ['PUT', CALENDAR_PATHS.publish],
    ] as const) {
      const res = await call(
        method,
        calendarPath(path, 2026),
        null,
        method === 'PUT' ? {} : undefined,
      );
      expect(res.statusCode, `${method} ${path}`).toBe(401);
    }
  });

  it('o colaborador também consulta o calendário publicado', async () => {
    await publish(2026, [{ date: '2026-01-01', reason: 'Confraternização Universal' }]);
    const res = await call('GET', calendarPath(CALENDAR_PATHS.year, 2026), collaborator);
    expect(res.json()).toMatchObject({ published: true });
  });

  it('ano fora de 2000 a 2100 dá validation_error', async () => {
    for (const year of ['1999', '2101', 'abcd']) {
      const res = await call('GET', `/api/calendar/${year}`, user);
      expect(res.statusCode, year).toBe(400);
      expect(res.json()).toMatchObject({ error: 'validation_error' });
    }
  });

  it('as regras do servidor usam o publicado e recusam ano não publicado (CA07)', async () => {
    await publish(2026, [{ date: '2026-12-31', reason: 'Último dia do ano' }]);
    const rules = await t.calendar.tradingCalendar(2026, 2026);
    expect(rules.isTradingDay('2026-12-30')).toBe(true);
    expect(rules.isTradingDay('2026-12-31')).toBe(false);
    expect(() => rules.nextTradingDay('2026-12-31')).toThrow(CalendarNotPublishedError);

    await publish(2027, [{ date: '2027-01-01', reason: 'Confraternização Universal' }]);
    const both = await t.calendar.tradingCalendar(2026, 2026);
    expect(both.nextTradingDay('2026-12-30')).toBe('2027-01-04');
  });
});
