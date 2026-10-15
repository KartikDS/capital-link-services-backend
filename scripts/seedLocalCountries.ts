/**
 * Loads the website's country list into a LOCAL `tbl_countries`, so the admin's
 * country dropdowns match the order form while developing.
 *
 * `npm run db:seed-countries`
 *
 * The order form offers about 250 countries from its own list and resolves each
 * one to a `tbl_countries` row by name. A development database that holds only a
 * handful of rows therefore saves most destinations as blank and shows three
 * choices in the admin. This adds the missing names and nothing else.
 *
 * Narrow on purpose:
 * - **Loopback only.** It refuses a non-local `DB_HOST` and has no override. A live
 *   database has its own country table, kept by CLS, and this must never touch it.
 * - **Inserts only.** A name already present (any case) is left exactly as it is.
 *   Nothing is updated or deleted.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ quiet: true });

const main = async (): Promise<void> => {
  const host = process.env.DB_HOST ?? '';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      'DB_HOST is not a loopback address. Refusing to seed a remote database.'
    );
  }

  const names = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../db/seed/website-countries.json'), 'utf8')
  ) as string[];

  const conn = await mysql.createConnection({
    host,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
  });

  const [rows] = await conn.query('SELECT country_name FROM tbl_countries');
  const have = new Set(
    (rows as { country_name: string | null }[]).map((r) =>
      (r.country_name ?? '').trim().toLowerCase()
    )
  );

  let added = 0;
  for (const name of names) {
    if (have.has(name.toLowerCase())) continue;
    await conn.query(
      'INSERT INTO tbl_countries (country_name, country_name_display, country_code, priority) VALUES (?, ?, ?, ?)',
      [name, name, '', 0]
    );
    added += 1;
  }

  await conn.end();
  console.log(
    `tbl_countries on ${process.env.DB_NAME}: ${added} added, ${have.size} already there.`
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
