import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const program = new Command();

program
  .name('knex-config')
  .description(chalk.cyan('Knex.js configuration and migration generator'))
  .version('1.0.0');

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg);
}

function success(msg: string) {
  log(chalk.green('✔ ') + msg);
}

function info(msg: string) {
  log(chalk.blue('ℹ ') + msg);
}

function warn(msg: string) {
  log(chalk.yellow('⚠ ') + msg);
}

function error(msg: string) {
  log(chalk.red('✖ ') + msg);
}

function writeFile(filePath: string, content: string, label?: string) {
  const abs = resolve(process.cwd(), filePath);
  if (existsSync(abs)) {
    warn(`File already exists, skipping: ${chalk.bold(filePath)}`);
    return;
  }
  writeFileSync(abs, content, 'utf-8');
  success(`Created ${chalk.bold(label ?? filePath)}`);
}

function ensureDir(dir: string) {
  const abs = resolve(process.cwd(), dir);
  if (!existsSync(abs)) {
    mkdirSync(abs, { recursive: true });
    success(`Created directory ${chalk.bold(dir)}`);
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

// ─── Knexfile templates ──────────────────────────────────────────────────────

function postgresKnexfile(): string {
  return `import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'myapp_dev',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASS ?? '',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
    },
  },

  staging: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 20 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
  },
};

export default config;
`;
}

function mysqlKnexfile(): string {
  return `import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'myapp_dev',
      user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASS ?? '',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      ssl: { rejectUnauthorized: true },
    },
    pool: { min: 2, max: 20 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
  },
};

export default config;
`;
}

function sqliteKnexfile(): string {
  return `import type { Knex } from 'knex';
import { join } from 'path';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: join(process.cwd(), 'dev.sqlite3'),
    },
    useNullAsDefault: true,
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
    },
  },

  test: {
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
  },
};

export default config;
`;
}

// ─── Migration template ──────────────────────────────────────────────────────

function migrationTemplate(name: string): string {
  return `import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('${name}', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('${name}');
}
`;
}

// ─── Seed template ────────────────────────────────────────────────────────────

function seedTemplate(name: string): string {
  return `import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex('${name}').del();

  // Inserts seed entries
  await knex('${name}').insert([
    { name: 'Sample ${name} 1' },
    { name: 'Sample ${name} 2' },
    { name: 'Sample ${name} 3' },
  ]);
}
`;
}

// ─── Validate ────────────────────────────────────────────────────────────────

type KnexConfig = Record<string, {
  client?: unknown;
  connection?: unknown;
  migrations?: { tableName?: unknown; directory?: unknown };
  seeds?: { directory?: unknown };
  pool?: { min?: unknown; max?: unknown };
}>;

function validateKnexfile(filePath: string): boolean {
  const abs = resolve(process.cwd(), filePath);
  if (!existsSync(abs)) {
    error(`File not found: ${chalk.bold(filePath)}`);
    return false;
  }

  let raw: string;
  try {
    raw = readFileSync(abs, 'utf-8');
  } catch (e) {
    error(`Cannot read file: ${filePath}`);
    return false;
  }

  const knownClients = ['pg', 'pg-native', 'mysql', 'mysql2', 'sqlite3', 'better-sqlite3', 'oracledb', 'mssql'];
  let hasErrors = false;

  // Check client field
  for (const client of knownClients) {
    if (raw.includes(`client: '${client}'`) || raw.includes(`client: "${client}"`)) {
      success(`Recognized client: ${chalk.bold(client)}`);
    }
  }

  if (!raw.includes('client:')) {
    error('Missing required field: client');
    hasErrors = true;
  }

  if (!raw.includes('connection:')) {
    error('Missing required field: connection');
    hasErrors = true;
  }

  if (!raw.includes('migrations:')) {
    warn('No migrations config found — using defaults');
  } else {
    success('Migrations config present');
  }

  if (!raw.includes('seeds:')) {
    info('No seeds config found (optional)');
  } else {
    success('Seeds config present');
  }

  // Check for hardcoded passwords (basic check)
  const passwordPattern = /password:\s*['"][^'"]{3,}['"]/;
  if (passwordPattern.test(raw)) {
    warn('Possible hardcoded password detected — use environment variables');
  }

  if (raw.includes('process.env')) {
    success('Uses environment variables for sensitive config');
  }

  if (!hasErrors) {
    log('');
    log(chalk.green.bold('Knexfile validation passed!'));
  } else {
    log('');
    log(chalk.red.bold('Knexfile validation failed — fix errors above.'));
  }

  return !hasErrors;
}

// ─── Commands ────────────────────────────────────────────────────────────────

program
  .command('init <dialect>')
  .description('Generate a knexfile for the given dialect (pg | mysql | sqlite)')
  .option('-o, --output <file>', 'Output file name', 'knexfile.ts')
  .action((dialect: string, opts: { output: string }) => {
    log('');
    log(chalk.bold.cyan('knex-config init'));
    log(chalk.dim('─'.repeat(40)));

    const d = dialect.toLowerCase();
    const supported = ['pg', 'postgres', 'postgresql', 'mysql', 'mysql2', 'sqlite', 'sqlite3'];

    if (!supported.includes(d)) {
      error(`Unsupported dialect: ${chalk.bold(dialect)}`);
      info(`Supported: ${supported.join(', ')}`);
      process.exit(1);
    }

    let content: string;
    let clientName: string;

    if (d === 'pg' || d === 'postgres' || d === 'postgresql') {
      content = postgresKnexfile();
      clientName = 'PostgreSQL';
    } else if (d === 'mysql' || d === 'mysql2') {
      content = mysqlKnexfile();
      clientName = 'MySQL';
    } else {
      content = sqliteKnexfile();
      clientName = 'SQLite';
    }

    writeFile(opts.output, content, opts.output);
    ensureDir('migrations');
    ensureDir('seeds');

    log('');
    info(`Dialect: ${chalk.bold(clientName)}`);
    info(`Config:  ${chalk.bold(opts.output)}`);
    log('');
    log(chalk.dim('Next steps:'));
    log(chalk.dim(`  1. Set DB_HOST, DB_NAME, DB_USER, DB_PASS in .env`));
    log(chalk.dim(`  2. Run: npx knex migrate:latest`));
    log(chalk.dim(`  3. Run: npx knex seed:run`));
    log('');
  });

program
  .command('migration <name>')
  .description('Create a new migration scaffold in ./migrations')
  .option('-d, --dir <directory>', 'Migrations directory', 'migrations')
  .action((name: string, opts: { dir: string }) => {
    log('');
    log(chalk.bold.cyan('knex-config migration'));
    log(chalk.dim('─'.repeat(40)));

    ensureDir(opts.dir);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fileName = `${timestamp()}_${slug}.ts`;
    const filePath = join(opts.dir, fileName);

    writeFile(filePath, migrationTemplate(slug));

    log('');
    info(`Migration: ${chalk.bold(fileName)}`);
    info(`Table:     ${chalk.bold(slug)}`);
    log('');
    log(chalk.dim('Run with: npx knex migrate:latest'));
    log('');
  });

program
  .command('seed <name>')
  .description('Create a new seed file in ./seeds')
  .option('-d, --dir <directory>', 'Seeds directory', 'seeds')
  .action((name: string, opts: { dir: string }) => {
    log('');
    log(chalk.bold.cyan('knex-config seed'));
    log(chalk.dim('─'.repeat(40)));

    ensureDir(opts.dir);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fileName = `${slug}.ts`;
    const filePath = join(opts.dir, fileName);

    writeFile(filePath, seedTemplate(slug));

    log('');
    info(`Seed file: ${chalk.bold(fileName)}`);
    info(`Table:     ${chalk.bold(slug)}`);
    log('');
    log(chalk.dim('Run with: npx knex seed:run'));
    log('');
  });

program
  .command('validate')
  .description('Validate the knexfile in the current directory')
  .option('-f, --file <path>', 'Knexfile path', 'knexfile.ts')
  .action((opts: { file: string }) => {
    log('');
    log(chalk.bold.cyan('knex-config validate'));
    log(chalk.dim('─'.repeat(40)));
    log(`Validating: ${chalk.bold(opts.file)}`);
    log('');

    validateKnexfile(opts.file);
    log('');
  });

program.parse(process.argv);
