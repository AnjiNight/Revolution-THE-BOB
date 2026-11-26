import { describe, expect, it } from 'vitest';
import {
  newsReferenceDay,
  newsReferenceDayStart,
  validateAssetNewsDaysQuery,
  validateAssetNewsQuery,
  validateNewOwnFeed,
  validateNewsFeedQuery,
  validateUpdateMySource,
  weightedTone,
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

describe('fontes do usuário e tela Notícias (SPEC-030)', () => {
  it('feed próprio: https obrigatório, nome opcional e limpo', () => {
    expect(validateNewOwnFeed({ url: 'https://Blog.Exemplo/feed', name: '  Meu   blog ' })).toEqual(
      {
        success: true,
        data: { url: 'https://blog.exemplo/feed', name: 'Meu blog' },
      },
    );
    expect(validateNewOwnFeed({ url: 'https://blog.exemplo/feed', name: '' })).toEqual({
      success: true,
      data: { url: 'https://blog.exemplo/feed' },
    });
    expect(validateNewOwnFeed({ url: 'http://blog.exemplo/feed' })).toMatchObject({
      fields: { url: 'not_https' },
    });
    expect(validateNewOwnFeed({ url: 'https://blog.exemplo', name: 'x'.repeat(81) })).toMatchObject(
      {
        fields: { name: 'too_long' },
      },
    );
  });

  it('mudança da fonte: ligada, prioridade e nome; o endereço não muda', () => {
    expect(validateUpdateMySource({ active: false, priority: 'high' })).toEqual({
      success: true,
      data: { active: false, priority: 'high' },
    });
    expect(validateUpdateMySource({ priority: 'urgente' })).toMatchObject({
      fields: { priority: 'invalid_option' },
    });
    expect(validateUpdateMySource({ url: 'https://outro' })).toMatchObject({
      fields: { url: 'immutable' },
    });
    expect(validateUpdateMySource({})).toMatchObject({ success: false });
  });

  it('filtros da tela Notícias: 30 dias por padrão, setor com a classe, página de 20', () => {
    const asset = '6f1c7e0a-1b2c-4d3e-8f90-123456789abc';
    expect(validateNewsFeedQuery({})).toEqual({
      success: true,
      data: { period: '30d', offset: 0 },
    });
    expect(
      validateNewsFeedQuery({
        period: '12m',
        offset: '40',
        asset: asset.toUpperCase(),
        sector: 'fii:logistica',
        sentiment: 'negative',
      }),
    ).toEqual({
      success: true,
      data: {
        period: '12m',
        offset: 40,
        asset,
        sector: { class: 'fii', code: 'logistica' },
        sentiment: 'negative',
      },
    });
    expect(
      validateNewsFeedQuery({ sector: 'stock:logistica', offset: '10', period: '1d' }),
    ).toEqual({
      success: false,
      fields: { sector: 'invalid_option', offset: 'invalid_option', period: 'invalid_option' },
    });
  });

  it('filtros vindos da tela: offset em número e setor como objeto', () => {
    expect(
      validateNewsFeedQuery({
        period: '30d',
        offset: 20,
        sector: { class: 'stock', code: 'financeiro' },
      }),
    ).toEqual({
      success: true,
      data: { period: '30d', offset: 20, sector: { class: 'stock', code: 'financeiro' } },
    });
    expect(validateNewsFeedQuery({ offset: -20 })).toMatchObject({
      fields: { offset: 'invalid_option' },
    });
  });

  it('tom ponderado: a soma dos pesos de cada tom sobre a soma dos pesos (CA09)', () => {
    expect(weightedTone([])).toBeNull();
    // Pai (4) positiva, alta (3) neutra, baixa (1) negativa: 4/8, 3/8, 1/8.
    expect(
      weightedTone([
        { sentiment: 'positive', weight: 4 },
        { sentiment: 'neutral', weight: 3 },
        { sentiment: 'negative', weight: 1 },
      ]),
    ).toEqual({ shares: { positive: 0.5, neutral: 0.375, negative: 0.125 }, classified: 3 });
  });
});
