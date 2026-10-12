import {
  AUTH_PATHS,
  emailConfirmationResendSchema,
  emailConfirmationSchema,
  googleLoginSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { HttpError } from '../../../shared/http/http-error.js';
import { parseBody } from '../../../shared/http/validation.js';
import type { AuthService } from '../application/auth-service.js';

export interface AuthRoutesOptions {
  auth: AuthService;
  /** Limite de requisições por minuto e por IP em cada rota de /api/auth (RNF10). */
  rateLimitPerMinute: number;
}

const DOMAIN_ERROR_HTTP: Record<string, { status: number; message: string }> = {
  email_in_use: { status: 409, message: 'Este e-mail já está em uso.' },
  invalid_credentials: { status: 401, message: 'E-mail ou senha incorretos.' },
  invalid_refresh_token: { status: 401, message: 'Sessão expirada. Entre novamente.' },
  wrong_account_type: { status: 403, message: 'Esta conta não pode entrar por aqui.' },
  terms_required: { status: 400, message: 'Aceite os termos para criar a conta.' },
  google_token_invalid: { status: 401, message: 'Não foi possível confirmar o login com Google.' },
  google_email_not_verified: {
    status: 403,
    message: 'O Google não confirmou este e-mail.',
  },
  unauthorized: { status: 401, message: 'Autenticação necessária.' },
  invalid_password: { status: 401, message: 'Senha atual incorreta.' },
  email_change_not_allowed: {
    status: 403,
    message: 'O e-mail desta conta vem do Google e não pode ser trocado aqui.',
  },
  password_change_not_allowed: {
    status: 403,
    message: 'Esta conta entra pelo Google e não tem senha.',
  },
  invalid_reset_code: { status: 400, message: 'Código inválido ou vencido.' },
  email_not_confirmed: { status: 403, message: 'Confirme o e-mail antes de entrar.' },
  invalid_confirmation_code: { status: 400, message: 'Código inválido ou vencido.' },
  email_confirmation_unavailable: {
    status: 503,
    message: 'A confirmação de e-mail não está disponível neste servidor.',
  },
  password_reset_unavailable: {
    status: 503,
    message: 'A recuperação de senha não está disponível neste servidor.',
  },
};

/** Converte erros do domínio de identidade em respostas HTTP. */
export async function run<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const mapped = error instanceof DomainError ? DOMAIN_ERROR_HTTP[error.code] : undefined;
    if (error instanceof DomainError && mapped) {
      throw new HttpError(mapped.status, error.code, mapped.message);
    }
    throw error;
  }
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const { auth } = options;
  const limited = {
    config: { rateLimit: { max: options.rateLimitPerMinute, timeWindow: '1 minute' } },
  };

  // SPEC-039: a conta nasce pendente; a sessão só vem depois da confirmação do e-mail.
  app.post(AUTH_PATHS.register, limited, async (request, reply) => {
    const input = parseBody(registerSchema, request.body);
    await run(() => auth.register(input, request.log));
    return reply.status(202).send();
  });

  app.post(AUTH_PATHS.emailConfirmationConfirm, limited, async (request, reply) => {
    const input = parseBody(emailConfirmationSchema, request.body);
    return reply.send(await run(() => auth.confirmEmail(input, request.log)));
  });

  // Sempre 202 e sem corpo: a resposta não diz se existe conta pendente com esse e-mail.
  app.post(AUTH_PATHS.emailConfirmationResend, limited, async (request, reply) => {
    const input = parseBody(emailConfirmationResendSchema, request.body);
    await run(() => auth.resendConfirmation(input, request.log));
    return reply.status(202).send();
  });

  app.post(AUTH_PATHS.login, limited, async (request, reply) => {
    const input = parseBody(loginSchema, request.body);
    return reply.send(await run(() => auth.login(input, 'user', request.log)));
  });

  // Área do colaborador: tela própria, só aceita contas criadas pela equipe (SPEC-002 §4).
  app.post(AUTH_PATHS.collaboratorLogin, limited, async (request, reply) => {
    const input = parseBody(loginSchema, request.body);
    return reply.send(await run(() => auth.login(input, 'collaborator', request.log)));
  });

  app.post(AUTH_PATHS.google, limited, async (request, reply) => {
    if (!auth.googleEnabled) {
      throw new HttpError(503, 'google_login_unavailable', 'Login com Google não configurado.');
    }
    const input = parseBody(googleLoginSchema, request.body);
    return reply.send(await run(() => auth.loginWithGoogle(input)));
  });

  app.post(AUTH_PATHS.refresh, limited, async (request, reply) => {
    const { refreshToken } = parseBody(refreshSchema, request.body);
    return reply.send(await run(() => auth.refresh(refreshToken)));
  });

  app.post(AUTH_PATHS.logout, limited, async (request, reply) => {
    const { refreshToken } = parseBody(refreshSchema, request.body);
    await auth.logout(refreshToken);
    return reply.status(204).send();
  });
}
