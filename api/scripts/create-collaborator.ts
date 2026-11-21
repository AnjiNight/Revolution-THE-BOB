/**
 * Cria uma conta de colaborador (SPEC-002 §4). Colaborador nunca se cadastra pelo app:
 * a conta é criada pela equipe e a senha, gerada pelo sistema, aparece uma única vez.
 *
 * Uso: npm run colaborador:criar --workspace api -- --nome "Nome Sobrenome" --email pessoa@exemplo.com
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createCollaborator } from '../src/modules/identity/application/create-collaborator.js';
import { EmailInUseError } from '../src/modules/identity/domain/errors.js';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher.js';
import { PrismaUserRepository } from '../src/modules/identity/infrastructure/prisma-user-repository.js';
import { createPrismaClient } from '../src/shared/infrastructure/database.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values } = parseArgs({
    options: { nome: { type: 'string' }, email: { type: 'string' } },
  });
  if (!values.nome || !values.email) {
    throw new Error('Uso: npm run colaborador:criar -- --nome "Nome" --email pessoa@exemplo.com');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória.');

  const prisma = createPrismaClient(databaseUrl);
  try {
    const result = await createCollaborator(
      new PrismaUserRepository(prisma),
      new Argon2PasswordHasher(),
      { name: values.nome, email: values.email },
    );
    if (!result.ok) {
      throw new Error(`Dados inválidos: ${JSON.stringify(result.fields)}`);
    }
    console.log('Colaborador criado.');
    console.log(`  Nome:   ${result.user.name}`);
    console.log(`  E-mail: ${result.user.email}`);
    console.log(`  Senha:  ${result.password}`);
    console.log(
      'Entregue a senha ao colaborador por um canal seguro. Ela não será mostrada de novo.',
    );
  } catch (error) {
    if (error instanceof EmailInUseError) {
      throw new Error('Já existe uma conta com este e-mail.', { cause: error });
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
