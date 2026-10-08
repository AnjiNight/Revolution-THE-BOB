/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MAIN_VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
