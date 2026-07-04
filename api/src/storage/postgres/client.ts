import { Pool, PoolConfig } from 'pg';
import { loadEnv } from '../../env';

const env = loadEnv();

const poolConfig: PoolConfig = {
  connectionString: env.postgresUri,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res.rows;
  } catch (error) {
    console.error('Query error', { text, error });
    throw error;
  }
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function runMigrations(): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  // Path from project root
  const migrationsDir = path.join(process.cwd(), 'src/storage/postgres/migrations');
  
  // Create migrations table if it doesn't exist
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // Get applied migrations
  const applied = await query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
  const appliedVersions = new Set(applied.map((m) => m.version));

  // Read migration files
  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.split('_')[0];
    if (appliedVersions.has(version)) {
      console.log(`Migration ${version} already applied, skipping`);
      continue;
    }

    console.log(`Applying migration ${version}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await query(sql);
    await query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    console.log(`Migration ${version} applied successfully`);
  }
}
