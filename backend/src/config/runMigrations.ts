/**
 * runMigrations.ts - Simple Migration Runner
 * MovieAnimation Backend - Phase 9
 * 
 * Reads .sql files from the migrations directory and executes them
 * in order against the database. Skips already-run migrations.
 */

import fs from 'fs';
import path from 'path';
import pool from '../config/database';

// __dirname = backend/src/config, need to reach project-root/migrations
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    'SELECT name FROM _migrations ORDER BY id'
  );
  return new Set(result.rows.map((r) => r.name));
}

async function applyMigration(filename: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`  ✅ Applied: ${filename}`);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<string[]> {
  const applied: string[] = [];

  try {
    await ensureMigrationsTable();
    const appliedSet = await getAppliedMigrations();

    // Get all .sql files sorted by name (which includes numeric prefix)
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ⏭️  Skipped (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await applyMigration(file, sql);
      applied.push(file);
    }

    if (applied.length === 0) {
      console.log('  ✅ All migrations are up to date');
    }

    return applied;
  } catch (err: any) {
    console.error(`  ❌ Migration failed: ${err.message}`);
    throw err;
  }
}
