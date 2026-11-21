import { isIP } from 'node:net';

/**
 * Endereço que o servidor não pode buscar (SPEC-027 §4.2, DA19): o próprio computador, a rede
 * interna e os endereços reservados. Vale para o IPv4 e o IPv6 (com o IPv4 dentro dele).
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return privateV4(address);
  if (version !== 6) return true;
  const lower = address.toLowerCase();
  const mapped = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return privateV4(mapped[1]);
  return (
    lower === '::' ||
    lower === '::1' ||
    /^f[cd]/.test(lower) || // fc00::/7, rede local única
    /^fe[89ab]/.test(lower) || // fe80::/10, link local
    /^ff/.test(lower) || // multicast
    lower.startsWith('2001:db8') // documentação
  );
}

function privateV4(address: string): boolean {
  const [a = 0, b = 0] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast e reservados
  );
}

/** Nomes que nunca são públicos, antes mesmo de resolver. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.test')
  );
}
