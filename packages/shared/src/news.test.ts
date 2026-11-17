import { describe, expect, it } from 'vitest';
import {
  newsReferenceDay,
  newsReferenceDayStart,
  validateAssetNewsDaysQuery,
  validateAssetNewsQuery,
} from './news.js';

describe('dia de referência da notícia (SPEC-029 §4.1, decisão 3)', () => {
  it.each([
    ['quarta às 14h: a própria quarta', '2026-11-11T17:00:00Z', '2026-11-11'],
    ['quarta às 17h59: ainda a quarta', '2026-11-11T20:59:00Z', '2026-11-11'],
    ['quarta às 18h: já a quinta', '2026-11-11T21:00:00Z', '2026-11-12'],
    ['quarta às 23h30 (já quinta em UTC): a quinta', '2026-11-12T02:30:00Z', '2026-11-12'],
    ['sábado às 10h: o sábado (o pregão é o da segunda)', '2026-11-14T13:00:00Z', '2026-11-14'],
  ])('%s', (_case, publishedAt, day) => {
    expect(newsReferenceDay(new Date(publishedAt))).toBe(day);
  });

  it('o dia de referência começa às 18h de Brasília da véspera', () => {
    const start = newsReferenceDayStart('2026-11-12');
    expect(start.toISOString()).toBe('2026-11-11T21:00:00.000Z');
    expect(newsReferenceDay(start)).toBe('2026-11-12');
    expect(newsReferenceDay(new Date(start.getTime() - 1))).toBe('2026-11-11');
    // Virada de mês.
    expect(newsReferenceDayStart('2026-12-01').toISOString()).toBe('2026-11-30T21:00:00.000Z');
  });
});

describe('consulta das notícias do ativo (SPEC-029 §5.1)', () => {
  it('sem nada: o grupo principal, a partir do começo', () => {
    expect(validateAssetNewsQuery({})).toEqual({
      success: true,
      data: { group: 'main', offset: 0 },
    });
  });

  it('grupo de listas, página seguinte e o intervalo de um pregão', () => {
    expect(
      validateAssetNewsQuery({
        group: 'list',
        offset: '10',
        after: '2026-11-10',
        until: '2026-11-11',
      }),
    ).toEqual({
      success: true,
      data: { group: 'list', offset: 10, after: '2026-11-10', until: '2026-11-11' },
    });
  });

  it('recusa grupo, página e intervalo inválidos', () => {
    expect(validateAssetNewsQuery({ group: 'outro', offset: '5' })).toEqual({
      success: false,
      fields: { group: 'invalid_option', offset: 'invalid_option' },
    });
    expect(validateAssetNewsQuery({ offset: '-10' })).toMatchObject({ success: false });
    expect(validateAssetNewsQuery({ after: '2026-11-10' })).toEqual({
      success: false,
      fields: { until: 'invalid_date' },
    });
    expect(validateAssetNewsQuery({ after: '2026-11-12', until: '2026-11-12' })).toEqual({
      success: false,
      fields: { until: 'before_start' },
    });
    expect(validateAssetNewsQuery({ after: '2026-10-01', until: '2026-11-02' })).toEqual({
      success: false,
      fields: { until: 'too_long' },
    });
    expect(validateAssetNewsQuery({ after: '2026-02-30', until: '2026-03-02' })).toMatchObject({
      fields: { after: 'invalid_date' },
    });
  });

  it('marcadores: o período do gráfico, 1 ano por padrão', () => {
    expect(validateAssetNewsDaysQuery({})).toEqual({ success: true, data: { period: '1y' } });
    expect(validateAssetNewsDaysQuery({ period: 'max' })).toEqual({
      success: true,
      data: { period: 'max' },
    });
    expect(validateAssetNewsDaysQuery({ period: '2y' })).toEqual({
      success: false,
      fields: { period: 'invalid_option' },
    });
  });
});
