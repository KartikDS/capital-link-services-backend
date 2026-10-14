/**
 * Applies the CLS Ops migration to a database, outside the application.
 *
 * `npm run ops:migrate`            applies 2026-10-14-ops-document-routes.sql
 * `npm run ops:migrate -- --undo`  drops the tables that migration created
 *
 * The API itself never issues DDL (see `config/database.ts`), so this is a
 * separate process with its own connection. It is deliberately narrow:
 *
 * - **Only `tbl_ops_` statements run.** `CREATE TABLE IF NOT EXISTS`,
 *   `INSERT IGNORE` and (with `--undo`) `DROP TABLE IF EXISTS`, each naming a
 *   `tbl_ops_*` table. Anything else in the file aborts the run before the first
 *   statement executes.
 * - **Loopback only.** It refuses a non-local `DB_HOST` unless `--allow-remote`
 *   is passed, so it cannot be pointed at the live database by accident. For
 *   live, hand the .sql file to CLS's DBA.
 * - **It proves it changed nothing else.** Before and after, it takes a CHECKSUM
 *   and row count of every table that is not `tbl_ops_*` and fails loudly if a
 *   single one differs.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ quiet: true });

const undo = process.argv.includes('--undo');
const allowRemote = process.argv.includes('--allow-remote');
const file = path.resolve(
  __dirname,
  '../db/migrations',
  undo ? '2026-10-14-ops-document-routes.undo.sql' : '2026-10-14-ops-document-routes.sql'
);

const ALLOWED = undo
  ? [/^DROP TABLE IF EXISTS `tbl_ops_[a-z_]+`$/i]
  : [
      /^CREATE TABLE IF NOT EXISTS `tbl_ops_[a-z_]+`\s*\(/i,
      /^INSERT IGNORE INTO `tbl_ops_[a-z_]+`/i,
    ];

const statementsOf = (sql: string): string[] =>
  sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

const main = async (): Promise<void> => {
  const host = process.env.DB_HOST ?? '';
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);

  if (!local && !allowRemote) {
    throw new Error(
      'DB_HOST is not a loopback address. Refusing to run. Give the .sql file to the DBA for a live database.'
    );
  }

  const statements = statementsOf(fs.readFileSync(file, 'utf8'));
  const bad = statements.find((s) => !ALLOWED.some((re) => re.test(s)));
  if (bad)
    throw new Error(
      `Refusing: statement is not an allowed tbl_ops_ statement:\n${bad.slice(0, 200)}`
    );

  const conn = await mysql.createConnection({
    host,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
  });

  const snapshot = async (): Promise<Map<string, string>> => {
    const [tables] = await conn.query(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME NOT LIKE 'tbl\\_ops\\_%'`
    );
    const out = new Map<string, string>();
    for (const row of tables as { t: string }[]) {
      const [c] = await conn.query(`CHECKSUM TABLE \`${row.t}\``);
      const [n] = await conn.query(`SELECT COUNT(*) AS n FROM \`${row.t}\``);
      out.set(
        row.t,
        `${(c as { Checksum: number | null }[])[0]?.Checksum}:${(n as { n: number }[])[0]?.n}`
      );
    }
    return out;
  };

  console.log(
    `${undo ? 'UNDO' : 'APPLY'} ${path.basename(file)} on ${process.env.DB_NAME}`
  );
  const before = await snapshot();
  console.log(`Snapshotted ${before.size} existing tables (checksum + row count).`);

  for (const s of statements) {
    await conn.query(s);
    console.log(' ok:', s.split('\n')[0]!.slice(0, 80));
  }

  const after = await snapshot();
  const changed = [...before].filter(([t, v]) => after.get(t) !== v).map(([t]) => t);
  await conn.end();

  if (changed.length) {
    throw new Error(`EXISTING TABLES CHANGED: ${changed.join(', ')}`);
  }
  console.log(
    `Verified: all ${before.size} existing tables are byte-for-byte unchanged.`
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
