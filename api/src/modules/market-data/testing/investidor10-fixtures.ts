/**
 * Páginas de exemplo do Investidor10 para os testes (SPEC-041), montadas à mão com a mesma
 * estrutura do HTML do site (conferida em 04/11/2026), sem copiar o conteúdo dele.
 */

export type DividendRow = [kind: string, exDate: string, payment: string, value: string];

function dividendsTable(rows: DividendRow[]): string {
  return `<table id="table-dividends-history"><thead><tr><th><h3>tipo</h3></th><th><h3>data com</h3></th>
<th><h3>pagamento</h3></th><th><h3>valor</h3></th></tr></thead><tbody>${rows
    .map(
      ([kind, ex, pay, value]) =>
        `<tr><td class="text-center">${kind}</td><td class="text-center">${ex}</td><td class="text-center">${pay}</td><td class="text-center"> ${value} </td></tr>`,
    )
    .join('')}</tbody></table>`;
}

/** Página de ação: grupos de cartões de indicadores, o id do histórico e os dividendos. */
export function stockPage(options: {
  groups?: Array<[group: string, cards: Array<[title: string, value: string]>]>;
  historyId?: number | null;
  dividends?: DividendRow[];
}): string {
  const groups = (options.groups ?? [])
    .map(
      ([group, cards]) =>
        `<section class="indicator-group"><h3>${group}</h3><div class="indicator-cards">${cards
          .map(
            ([title, value]) =>
              `<article class="indicator-card"><div class="indicator-card-title"><span>${title.replace('/', '/<wbr>')}</span></div>
<div class="indicator-card-value"><span>${value}</span></div></article>`,
          )
          .join('')}</div></section>`,
    )
    .join('');
  const script =
    options.historyId === null || options.historyId === undefined
      ? ''
      : `<script>$.get(\`/api/historico-indicadores/${options.historyId}/10?v=2\`).done(function (data) {});</script>`;
  return `<html><body><div id="table-indicators" class="indicator-groups">${groups}</div>
${dividendsTable(options.dividends ?? [])}${script}</body></html>`;
}

/** Página de FII: cartões do topo, as células de informação e os dividendos. */
export function fiiPage(options: {
  ticker: string;
  cards?: Array<[header: string, value: string]>;
  cells?: Array<[name: string, value: string]>;
  dividends?: DividendRow[];
}): string {
  const cards = (options.cards ?? [])
    .map(
      ([header, value]) =>
        `<div class="_card"><div class="_card-header"><div><span>${header}</span></div></div>
<div class="_card-body"><div><span class="value">${value}</span></div></div></div>`,
    )
    .join('');
  const cells = (options.cells ?? [])
    .map(
      ([name, value]) =>
        `<div class='cell'><div class="desc"><span class="d-flex justify-content-between align-items-center name"> ${name} </span>
<div class="value"><span> ${value} </span></div></div></div>`,
    )
    .join('');
  return `<html><body><section id="cards-ticker" class="cards-ticker--fii">${cards}</section>
<div id="table-indicators" class="table table-info-fii">${cells}</div>${dividendsTable(options.dividends ?? [])}</body></html>`;
}
