import { AccountDataService } from './application/account-data-service.js';
import { AuthService } from './application/auth-service.js';
import type { EmailCodeHasher } from './application/email-code.js';
import { EmailCodes } from './application/email-codes.js';
import { EmailConfirmationService } from './application/email-confirmation-service.js';
import { PasswordResetService } from './application/password-reset-service.js';
import type {
  AccessTokenService,
  BackgroundRunner,
  Clock,
  EmailCodeRepository,
  EmailSender,
  GoogleIdentityVerifier,
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from './application/ports.js';
import { ProfileService } from './application/profile-service.js';

export interface IdentityInfrastructure {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  emailCodes: EmailCodeRepository;
  hasher: PasswordHasher;
  codeHasher: EmailCodeHasher;
  accessTokens: AccessTokenService;
  refreshTokenTtlDays: number;
  /** Ausente sem SMTP: confirmação de e-mail e recuperação de senha desligadas (503). */
  mailer?: EmailSender | undefined;
  /** Ausente quando o login com Google não está configurado (DA24). */
  google?: GoogleIdentityVerifier | undefined;
  clock?: Clock | undefined;
  runInBackground?: BackgroundRunner | undefined;
  generateCode?: (() => string) | undefined;
}

/** Monta os serviços do módulo de identidade com a mesma ligação no servidor e nos testes. */
export function createIdentityServices(infra: IdentityInfrastructure) {
  const optional = {
    ...(infra.clock ? { clock: infra.clock } : {}),
    ...(infra.runInBackground ? { runInBackground: infra.runInBackground } : {}),
  };
  const mailer = infra.mailer ? { mailer: infra.mailer } : {};
  const codes = new EmailCodes({
    repository: infra.emailCodes,
    hasher: infra.codeHasher,
    ...(infra.clock ? { clock: infra.clock } : {}),
    ...(infra.generateCode ? { generateCode: infra.generateCode } : {}),
  });
  const confirmations = new EmailConfirmationService({
    users: infra.users,
    codes,
    ...mailer,
    ...optional,
  });
  const auth = new AuthService({
    users: infra.users,
    refreshTokens: infra.refreshTokens,
    hasher: infra.hasher,
    accessTokens: infra.accessTokens,
    refreshTokenTtlDays: infra.refreshTokenTtlDays,
    confirmations,
    ...(infra.google ? { google: infra.google } : {}),
    ...(infra.clock ? { clock: infra.clock } : {}),
  });
  const profile = new ProfileService({
    users: infra.users,
    refreshTokens: infra.refreshTokens,
    hasher: infra.hasher,
    sessions: auth,
    confirmations,
    ...(infra.clock ? { clock: infra.clock } : {}),
  });
  const passwordReset = new PasswordResetService({
    users: infra.users,
    codes,
    refreshTokens: infra.refreshTokens,
    hasher: infra.hasher,
    ...mailer,
    ...optional,
  });
  const accountData = new AccountDataService({
    users: infra.users,
    refreshTokens: infra.refreshTokens,
    codes,
    ...mailer,
    ...optional,
  });
  return { auth, profile, passwordReset, accountData, confirmations, codes };
}
