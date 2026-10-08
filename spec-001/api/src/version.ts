import { readFileSync } from 'node:fs';

/** Versão do servidor, lida do package.json (funciona a partir de src/ e de dist/). */
export function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}
