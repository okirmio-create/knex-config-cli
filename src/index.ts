import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const program = new Command();

program
  .name('knex-config')
  .description(chalk.cyan('Knex.js configuration, migration, seed and model generator'))
  .version('1.0.0');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function success(msg: string) { console.log(chalk.green('✔ ') + msg); }
function info(msg: string)    { console.log(chalk.blue('ℹ ') + msg); }
function warn(msg: string)    { console.log(chalk.yellow('⚠ ') + msg); }
function error(msg: string)   { console.log(chalk.red('✖ ') + msg); }
function hr()                 { console.log(chalk.dim('─'.repeat(40))); }

function writeFile(filePath: string, content: string) {
  const abs = resolve(process.cwd(), filePath);
  if (existsSync(abs)) {
    warn(`Already exists, skipping: ${chalk.bold(filePath)}`);
    return;
  }
  writeFileSync(abs, content, 'utf-8');
  success(`Created ${chalk.bold(filePath)}`);
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

function toPascal(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^./, (c: string) => c.toUpperCase());
}

// ─── Templates: knexfile ─────────────────────────────────────────────────────

function knexfileTemplate(client: string): string {
  const clientStr =
    client === 'pg'      ? 'pg' :
    client === 'mysql2'  ? 'mysql2' :
    client === 'sqlite3' ? 'better-sqlite3' :
                           'mssql';

  const defaultPort = client === 'pg' ? 5432 : client === 'mysql2' ? 3306 : 1433;
  const defaultUser = client === 'pg' ? 'postgres' : client === 'mysql2' ? 'root' : 'sa';

  const devConn = client === 'sqlite3'
    ? `\n      filename: process.env.DB_FILE ?? './dev.sqlite3',`
    : client === 'mssql'
    ? `\n      server: process.env.DB_HOST ?? '127.0.0.1',\n      port: Number(process.env.DB_PORT ?? ${defaultPort}),\n      database: process.env.DB_NAME ?? 'myapp_dev',\n      user: process.env.DB_USER ?? '${defaultUser}',\n      password: process.env.DB_PASS ?? '',`
    : `\n      host: process.env.DB_HOST ?? '127.0.0.1',\n      port: Number(process.env.DB_PORT ?? ${defaultPort}),\n      database: process.env.DB_NAME ?? 'myapp_dev',\n      user: process.env.DB_USER ?? '${defaultUser}',\n      password: process.env.DB_PASS ?? '',`;

  const prodConn = client === 'sqlite3'
    ? `\n      filename: process.env.DB_FILE ?? './prod.sqlite3',`
    : client === 'pg'
    ? `\n      connectionString: process.env.DATABASE_URL,\n      ssl: { rejectUnauthorized: false },`
    : `\n      host: process.env.DB_HOST,\n      database: process.env.DB_NAME,\n      user: process.env.DB_USER,\n      password: process.env.DB_PASS,`;

  const extra = client === 'sqlite3' ? '\n    useNullAsDefault: true,' : '';

  return `import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: '${clientStr}',
    connection: {${devConn}
    },${extra}
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
    client: '${clientStr}',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      extension: 'ts',
    },
  },

  production: {
    client: '${clientStr}',
    connection: {${prodConn}
    },${extra}
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

// ─── Templates: migration ─────────────────────────────────────────────────────

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

function alterMigrationTemplate(name: string): string {
  return `import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('${name}', (table) => {
    // table.string('new_column').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('${name}', (table) => {
    // table.dropColumn('new_column');
  });
}
`;
}

// ─── Templates: seed ─────────────────────────────────────────────────────────

function seedTemplate(name: string): string {
  return `import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('${name}').del();
  await knex('${name}').insert([
    { name: 'Sample ${name} 1' },
    { name: 'Sample ${name} 2' },
    { name: 'Sample ${name} 3' },
  ]);
}
`;
}

// ─── Templates: model ────────────────────────────────────────────────────────

function modelTemplate(name: string): string {
  const pascal = toPascal(name);
  return `import type { Knex } from 'knex';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ${pascal} {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export type New${pascal} = Omit<${pascal}, 'id' | 'created_at' | 'updated_at'>;
export type Update${pascal} = Partial<New${pascal}>;

// ─── Repository ──────────────────────────────────────────────────────────────

export class ${pascal}Repository {
  private readonly table = '${name}';

  constructor(private readonly db: Knex) {}

  async findAll(): Promise<${pascal}[]> {
    return this.db<${pascal}>(this.table).select('*');
  }

  async findById(id: number): Promise<${pascal} | undefined> {
    return this.db<${pascal}>(this.table).where({ id }).first();
  }

  async findWhere(filters: Partial<${pascal}>): Promise<${pascal}[]> {
    return this.db<${pascal}>(this.table).where(filters).select('*');
  }

  async create(data: New${pascal}): Promise<${pascal}> {
    const [record] = await this.db<${pascal}>(this.table)
      .insert(data)
      .returning('*');
    return record;
  }

  async update(id: number, data: Update${pascal}): Promise<${pascal} | undefined> {
    const [record] = await this.db<${pascal}>(this.table)
      .where({ id })
      .update(data)
      .returning('*');
    return record;
  }

  async delete(id: number): Promise<boolean> {
    const count = await this.db<${pascal}>(this.table).where({ id }).delete();
    return count > 0;
  }

  async count(): Promise<number> {
    const [{ count }] = await this.db(this.table)
      .count<[{ count: string }]>('* as count');
    return Number(count);
  }

  async paginate(
    page: number,
    perPage: number,
  ): Promise<{ data: ${pascal}[]; total: number; page: number; perPage: number }> {
    const offset = (page - 1) * perPage;
    const [data, total] = await Promise.all([
      this.db<${pascal}>(this.table).select('*').limit(perPage).offset(offset),
      this.count(),
    ]);
    return { data, total, page, perPage };
  }
}
`;
}

// ─── Templates: env config ───────────────────────────────────────────────────

function envConfigTemplate(env: string): string {
  const isProd    = env === 'production';
  const isStaging = env === 'staging';

  const conn = isProd
    ? `{\n    connectionString: process.env.DATABASE_URL,\n    ssl: { rejectUnauthorized: false },\n  }`
    : isStaging
    ? `process.env.DATABASE_URL ?? {\n    host: process.env.DB_HOST ?? '127.0.0.1',\n    port: Number(process.env.DB_PORT ?? 5432),\n    database: process.env.DB_NAME ?? 'myapp_staging',\n    user: process.env.DB_USER,\n    password: process.env.DB_PASS,\n  }`
    : `{\n    host: process.env.DB_HOST ?? '127.0.0.1',\n    port: Number(process.env.DB_PORT ?? 5432),\n    database: process.env.DB_NAME ?? 'myapp_dev',\n    user: process.env.DB_USER ?? 'postgres',\n    password: process.env.DB_PASS ?? '',\n  }`;

  return `import type { Knex } from 'knex';

// Environment-specific Knex configuration: ${env}
const config: Knex.Config = {
  client: process.env.DB_CLIENT ?? 'pg',
  connection: ${conn},
  pool: {
    min: ${isProd ? 2 : 1},
    max: ${isProd ? 20 : isStaging ? 10 : 5},
    acquireTimeoutMillis: ${isProd ? 30000 : 10000},
    idleTimeoutMillis: ${isProd ? 30000 : 10000},
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  seeds: {
    directory: './seeds',
  },
  debug: ${isProd ? 'false' : "process.env.DB_DEBUG === 'true'"},
  log: {
    warn(msg: string)      { console.warn('[knex:warn]', msg); },
    error(msg: string)     { console.error('[knex:error]', msg); },
    deprecate(msg: string) { console.warn('[knex:deprecate]', msg); },
    debug(msg: string)     { if (process.env.DB_DEBUG === 'true') console.debug('[knex:debug]', msg); },
  },
};

export default config;
`;
}

// ─── Command: init ───────────────────────────────────────────────────────────

program
  .command('init <client>')
  .description('Generate knexfile.ts with connection config (pg, mysql2, sqlite3, mssql)')
  .option('-o, --output <file>', 'Output filename', 'knexfile.ts')
  .action((client: string, opts: { output: string }) => {
    console.log('');
    console.log(chalk.bold.cyan('knex-config init'));
    hr();

    const supported = ['pg', 'mysql2', 'sqlite3', 'mssql'];
    const aliases: Record<string, string> = {
      postgres: 'pg', postgresql: 'pg',
      mysql: 'mysql2',
      sqlite: 'sqlite3',
      sqlserver: 'mssql', 'sql-server': 'mssql',
    };
    const normalized = aliases[client.toLowerCase()] ?? client.toLowerCase();

    if (!supported.includes(normalized)) {
      error(`Unsupported client: ${chalk.bold(client)}`);
      info(`Supported: ${supported.join(', ')}`);
      process.exit(1);
    }

    writeFile(opts.output, knexfileTemplate(normalized));
    ensureDir('migrations');
    ensureDir('seeds');

    console.log('');
    info(`Client: ${chalk.bold(normalized)}`);
    info(`Config: ${chalk.bold(opts.output)}`);
    console.log(chalk.dim('\nNext steps:'));
    console.log(chalk.dim('  1. Set DB_HOST, DB_NAME, DB_USER, DB_PASS in .env'));
    console.log(chalk.dim('  2. npx knex migrate:latest'));
    console.log(chalk.dim('  3. npx knex seed:run'));
    console.log('');
  });

// ─── Command: migration ──────────────────────────────────────────────────────

program
  .command('migration <name>')
  .description('Generate migration file with createTable/alterTable scaffold')
  .option('-d, --dir <directory>', 'Migrations directory', 'migrations')
  .option('--alter', 'Scaffold an alterTable migration instead of createTable')
  .action((name: string, opts: { dir: string; alter?: boolean }) => {
    console.log('');
    console.log(chalk.bold.cyan('knex-config migration'));
    hr();

    ensureDir(opts.dir);

    const slug     = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fileName = `${timestamp()}_${slug}.ts`;
    const filePath = join(opts.dir, fileName);
    const content  = opts.alter ? alterMigrationTemplate(slug) : migrationTemplate(slug);

    writeFile(filePath, content);

    console.log('');
    info(`File:  ${chalk.bold(fileName)}`);
    info(`Table: ${chalk.bold(slug)}`);
    console.log(chalk.dim('\nRun with: npx knex migrate:latest'));
    console.log('');
  });

// ─── Command: seed ───────────────────────────────────────────────────────────

program
  .command('seed <name>')
  .description('Generate seed file with insert data scaffold')
  .option('-d, --dir <directory>', 'Seeds directory', 'seeds')
  .action((name: string, opts: { dir: string }) => {
    console.log('');
    console.log(chalk.bold.cyan('knex-config seed'));
    hr();

    ensureDir(opts.dir);

    const slug     = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filePath = join(opts.dir, `${slug}.ts`);

    writeFile(filePath, seedTemplate(slug));

    console.log('');
    info(`File:  ${chalk.bold(slug + '.ts')}`);
    info(`Table: ${chalk.bold(slug)}`);
    console.log(chalk.dim('\nRun with: npx knex seed:run'));
    console.log('');
  });

// ─── Command: model ──────────────────────────────────────────────────────────

program
  .command('model <name>')
  .description('Generate TypeScript interface + query builder repository for a table')
  .option('-d, --dir <directory>', 'Models output directory', 'models')
  .action((name: string, opts: { dir: string }) => {
    console.log('');
    console.log(chalk.bold.cyan('knex-config model'));
    hr();

    ensureDir(opts.dir);

    const slug     = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const pascal   = toPascal(slug);
    const filePath = join(opts.dir, `${slug}.ts`);

    writeFile(filePath, modelTemplate(slug));

    console.log('');
    info(`File:      ${chalk.bold(slug + '.ts')}`);
    info(`Interface: ${chalk.bold(pascal)}`);
    info(`Class:     ${chalk.bold(pascal + 'Repository')}`);
    console.log(chalk.dim('\nUsage:'));
    console.log(chalk.dim(`  import { ${pascal}Repository } from './${opts.dir}/${slug}';`));
    console.log(chalk.dim(`  const repo = new ${pascal}Repository(db);`));
    console.log(chalk.dim(`  const rows = await repo.findAll();`));
    console.log('');
  });

// ─── Command: config ─────────────────────────────────────────────────────────

program
  .command('config <env>')
  .description('Generate environment-specific knex config (development, staging, production)')
  .option('-o, --output <file>', 'Output filename (default: knexfile.<env>.ts)')
  .action((env: string, opts: { output?: string }) => {
    console.log('');
    console.log(chalk.bold.cyan('knex-config config'));
    hr();

    const supported = ['development', 'staging', 'production'];
    const aliases: Record<string, string> = {
      dev: 'development', develop: 'development',
      stage: 'staging', stg: 'staging',
      prod: 'production', prd: 'production',
    };
    const normalized = aliases[env.toLowerCase()] ?? env.toLowerCase();

    if (!supported.includes(normalized)) {
      error(`Unsupported environment: ${chalk.bold(env)}`);
      info(`Supported: ${supported.join(', ')}`);
      process.exit(1);
    }

    const outFile = opts.output ?? `knexfile.${normalized}.ts`;
    writeFile(outFile, envConfigTemplate(normalized));

    console.log('');
    info(`Environment: ${chalk.bold(normalized)}`);
    info(`Config:      ${chalk.bold(outFile)}`);
    console.log(chalk.dim('\nUse with:'));
    console.log(chalk.dim(`  NODE_ENV=${normalized} npx knex migrate:latest --knexfile ${outFile}`));
    console.log('');
  });

program.parse(process.argv);
