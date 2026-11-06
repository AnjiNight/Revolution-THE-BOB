import { CALENDAR_PATHS, parseCalendarYear, validateCalendarPublication } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../../../shared/http/http-error.js';
import { ensureValid } from '../../../shared/http/validation.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import {
  makeAuthenticate,
  requireAuth,
  requireCollaborator,
} from '../../identity/controllers/authenticate.js';
import type { CalendarService } from '../application/calendar-service.js';

export interface CalendarRoutesOptions {
  calendar: CalendarService;
  accessTokens: AccessTokenService;
}

interface YearParams {
  year: string;
}

/** Calendário de pregão (SPEC-005 §5.2): consulta para todos; sugestão e publicação da equipe. */
export function registerCalendarRoutes(app: FastifyInstance, options: CalendarRoutesOptions): void {
  const { calendar } = options;
  const authenticate = makeAuthenticate(options.accessTokens);
  const authenticated = { preHandler: authenticate };
  // O 403 vem antes da validação: quem não é da equipe não descobre nada da rota.
  const collaboratorOnly = { preHandler: [authenticate, requireCollaborator] };

  app.get<{ Params: YearParams }>(CALENDAR_PATHS.year, authenticated, async (request, reply) => {
    return reply.send(await calendar.getYear(routeYear(request.params)));
  });

  app.get<{ Params: YearParams }>(
    CALENDAR_PATHS.suggestion,
    collaboratorOnly,
    async (request, reply) => {
      return reply.send(calendar.suggest(routeYear(request.params)));
    },
  );

  // A lista enviada substitui a anterior inteira (CA04).
  app.put<{ Params: YearParams }>(
    CALENDAR_PATHS.publish,
    collaboratorOnly,
    async (request, reply) => {
      const year = routeYear(request.params);
      const publication = ensureValid(validateCalendarPublication(year, request.body));
      return reply.send(await calendar.publish(year, publication, requireAuth(request).userId));
    },
  );
}

function routeYear(params: YearParams): number {
  const year = parseCalendarYear(params.year);
  if (year === null) {
    throw new HttpError(400, 'validation_error', 'Ano inválido.', { year: 'invalid_date' });
  }
  return year;
}
