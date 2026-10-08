import type { PrismaClient } from '../../../shared/infrastructure/database.js';
import type { DatabaseProbe } from '../application/get-health.js';

/** Verifica o banco com `SELECT 1`, com limite de tempo para não travar a rota. */
export class PrismaDatabaseProbe implements DatabaseProbe {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly timeoutMs = 2000,
  ) {}

  async isAvailable(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.timeoutMs);
    });
    const query = this.prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    );
    try {
      return await Promise.race([query, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
