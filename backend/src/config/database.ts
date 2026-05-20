/**
 * database.ts - PostgreSQL Connection Pool
 * MovieAnimation Backend - Phase 2 Auth
 * 
 * Connects to the movieanimation database on the RTX 3060 node
 * via SSH tunnel (port 2222 → localhost:5432)
 */

import { Pool, PoolConfig } from 'pg';

const poolConfig: PoolConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USER || 'sim_admin',
  password: process.env.DATABASE_PASSWORD || 'SimData_Vector_2026!',
  database: process.env.DATABASE_NAME || 'movieanimation',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(poolConfig);

// Test connection on startup
pool.on('error', (err: Error) => {
  console.error('[Database] Unexpected pool error:', err.message);
});

pool.on('connect', () => {
  console.log('[Database] New client connected to movieanimation');
});

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();
    console.log('[Database] Connection test successful:', result.rows[0].current_time);
    return true;
  } catch (err: any) {
    console.error('[Database] Connection test failed:', err.message);
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
  console.log('[Database] Connection pool closed');
}

export default pool;
