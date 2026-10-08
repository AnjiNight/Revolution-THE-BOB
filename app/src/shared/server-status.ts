/** Canal IPC usado pela interface para pedir a situação do servidor ao processo principal. */
export const CHECK_SERVER_CHANNEL = 'server:check-health';

/** Situação do servidor exibida na tela inicial (SPEC-001, §5.2). */
export type ServerStatus =
  | { kind: 'connected'; version: string }
  | { kind: 'degraded'; version: string }
  | { kind: 'unavailable' }
  | { kind: 'invalid-url' };
