import {
  PORTFOLIO_PATHS,
  validateCashStatementQuery,
  validateNewCashEntry,
  validateNewPortfolio,
  validateNewReversal,
  validateNewTrade,
  validateRenamePortfolio,
  validateTradeQuoteQuery,
} from '@simulador/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { domainErrorRunner } from '../../../shared/http/domain-errors.js';
import { HttpError } from '../../../shared/http/http-error.js';
import { ensureValid } from '../../../shared/http/validation.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import {
  makeAuthenticate,
  requireAuth,
  requireUser,
} from '../../identity/controllers/authenticate.js';
import type { PortfolioService } from '../application/portfolio-service.js';
import type { TradingService } from '../application/trading-service.js';
import { PortfolioNotFoundError } from '../domain/errors.js';

export interface PortfolioRoutesOptions {
  portfolios: PortfolioService;
  /** SPEC-014: compra e venda na carteira ao vivo. */
  trading: TradingService;
  accessTokens: AccessTokenService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const run = domainErrorRunner({
  portfolio_not_found: { status: 404, message: 'Carteira não encontrada.' },
  portfolio_name_in_use: { status: 409, message: 'Você já tem uma carteira com este nome.' },
  portfolio_limit_reached: { status: 409, message: 'Você já tem o número máximo de carteiras.' },
  insufficient_cash: { status: 409, message: 'Saldo insuficiente em caixa.' },
  // SPEC-014
  insufficient_position: { status: 409, message: 'Você não tem essa quantidade do ativo.' },
  quote_changed: { status: 409, message: 'A cotação mudou. Confira o novo preço.' },
  market_closed: { status: 409, message: 'A bolsa está fechada hoje.' },
  no_quote_today: { status: 409, message: 'O ativo ainda não tem cotação hoje.' },
  asset_inactive: { status: 409, message: 'O ativo foi desativado e não pode ser comprado.' },
  historical_portfolio: {
    status: 409,
    message: 'A compra e venda na carteira histórica ainda não está disponível.',
  },
  asset_not_found: { status: 404, message: 'Ativo não encontrado.' },
  // SPEC-015
  entry_not_found: { status: 404, message: 'Lançamento não encontrado nesta carteira.' },
  already_reversed: { status: 409, message: 'Esse lançamento já foi estornado.' },
  reversal_window_closed: {
    status: 409,
    message: 'Na carteira ao vivo, compra e venda só se estornam no dia em que foram feitas.',
  },
  reversal_breaks_cash: { status: 409, message: 'Esse estorno deixaria o caixa negativo.' },
  // SPEC-016
  no_close_that_day: { status: 409, message: 'O ativo não tem fechamento da B3 nesse dia.' },
  history_pending: {
    status: 409,
    message: 'O histórico de preços deste ativo ainda está sendo carregado.',
  },
  reversal_breaks_position: {
    status: 409,
    message: 'Esse estorno deixaria uma venda maior que a posição.',
  },
  calendar_not_published: {
    status: 409,
    message: 'O calendário de pregão desse ano ainda não foi publicado.',
  },
  validation_error: { status: 400, message: 'Dados inválidos.' },
});

interface IdParams {
  id: string;
}

/**
 * Carteiras (SPEC-012 §5.1): só a conta de usuário (403 para o colaborador). Carteira de outra
 * pessoa responde 404, como se não existisse, e a tentativa fica no log sem dados da carteira
 * (RB03, QA05).
 */
export function registerPortfolioRoutes(
  app: FastifyInstance,
  options: PortfolioRoutesOptions,
): void {
  const { portfolios, trading } = options;
  const userOnly = { preHandler: [makeAuthenticate(options.accessTokens), requireUser] };

  /** Rota de uma carteira: a de outra pessoa vira o mesmo 404 e só deixa o aviso no log. */
  const owned = <T>(request: FastifyRequest, action: () => Promise<T>) =>
    run(async () => {
      try {
        return await action();
      } catch (error) {
        if (error instanceof PortfolioNotFoundError && error.foreign) {
          request.log.warn(
            { userId: requireAuth(request).userId },
            'tentativa de acessar carteira de outro usuário',
          );
        }
        throw error;
      }
    });

  app.get(PORTFOLIO_PATHS.list, userOnly, async (request, reply) => {
    return reply.send(await portfolios.list(requireAuth(request).userId));
  });

  app.post(PORTFOLIO_PATHS.list, userOnly, async (request, reply) => {
    const input = ensureValid(validateNewPortfolio(request.body));
    const portfolio = await run(() => portfolios.create(requireAuth(request).userId, input));
    return reply.status(201).send({ portfolio });
  });

  app.get<{ Params: IdParams }>(PORTFOLIO_PATHS.item, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const portfolio = await owned(request, () => portfolios.get(requireAuth(request).userId, id));
    return reply.send({ portfolio });
  });

  app.patch<{ Params: IdParams }>(PORTFOLIO_PATHS.item, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const { name } = ensureValid(validateRenamePortfolio(request.body));
    const portfolio = await owned(request, () =>
      portfolios.rename(requireAuth(request).userId, id, name),
    );
    return reply.send({ portfolio });
  });

  app.delete<{ Params: IdParams }>(PORTFOLIO_PATHS.item, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    await owned(request, () => portfolios.delete(requireAuth(request).userId, id));
    return reply.status(204).send();
  });

  // SPEC-013 §5.1: saldo e extrato; aporte ou retirada. Nenhuma rota altera ou apaga um lançamento.
  app.get<{ Params: IdParams }>(PORTFOLIO_PATHS.cash, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const { offset } = ensureValid(validateCashStatementQuery(request.query));
    const statement = await owned(request, () =>
      portfolios.statement(requireAuth(request).userId, id, offset),
    );
    return reply.send(statement);
  });

  app.post<{ Params: IdParams }>(PORTFOLIO_PATHS.cash, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const input = ensureValid(validateNewCashEntry(request.body));
    const result = await owned(request, () =>
      portfolios.addCashEntry(requireAuth(request).userId, id, input),
    );
    return reply.status(201).send(result);
  });

  // SPEC-014 §5.1: posições, cotação para negociar e a compra ou venda. Nenhuma rota altera ou
  // apaga uma negociação.
  app.get<{ Params: IdParams }>(PORTFOLIO_PATHS.positions, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const positions = await owned(request, () =>
      trading.positions(requireAuth(request).userId, id),
    );
    return reply.send(positions);
  });

  app.get<{ Params: IdParams }>(PORTFOLIO_PATHS.tradeQuote, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const { assetId, date } = ensureValid(validateTradeQuoteQuery(request.query));
    const quote = await owned(request, () =>
      trading.tradeQuote(requireAuth(request).userId, id, assetId, date),
    );
    return reply.send(quote);
  });

  app.post<{ Params: IdParams }>(PORTFOLIO_PATHS.trades, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const input = ensureValid(validateNewTrade(request.body));
    const result = await owned(request, () =>
      trading.trade(requireAuth(request).userId, id, input),
    );
    return reply.status(201).send(result);
  });

  // SPEC-015 §5.1: estorno de um lançamento. Nada é alterado nem apagado.
  app.post<{ Params: IdParams }>(PORTFOLIO_PATHS.reversals, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const { entryId } = ensureValid(validateNewReversal(request.body));
    const result = await owned(request, () =>
      portfolios.reverse(requireAuth(request).userId, id, entryId),
    );
    return reply.status(201).send(result);
  });
}

function portfolioId(request: FastifyRequest<{ Params: IdParams }>): string {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) {
    throw new HttpError(404, 'portfolio_not_found', 'Carteira não encontrada.');
  }
  return id;
}
