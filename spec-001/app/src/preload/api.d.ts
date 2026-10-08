import type { ServerStatus } from '../shared/server-status.js';

/** Funções que o processo principal expõe para a interface (window.api). */
export interface DesktopApi {
  checkServerHealth(): Promise<ServerStatus>;
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}
