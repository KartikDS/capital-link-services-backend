/**
 * Generates Sequelize models from the CLS schema dump.
 *
 * Run with `npm run models:generate`. Reads `db/schema/clspubli_staging.sql`
 * and writes one model per table into `src/models/generated`.
 *
 * This exists because the schema is fixed and large: ninety-four tables, some
 * with a hundred and fifty columns. Hand-typing them would guarantee a typo in
 * a column name, and a typo in a column name is a runtime error against a
 * database nobody wants to be debugging against. Generating them means the
 * models cannot disagree with the dump.
 *
 * The generated directory is committed, so the build needs no code generation
 * step and a reviewer can read exactly what the application thinks each table
 * looks like. Re-run this only when CLS supplies a new dump.
 *
 * Nothing here connects to a database and nothing here emits SQL.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const DUMP = path.join(ROOT, 'db/schema/clspubli_staging.sql');
const OUT_DIR = path.join(ROOT, 'src/models/generated');

/**
 * Tables the API does not model.
 *
 * Every one is a dated backup, a test copy or a debug scratchpad left behind by
 * the old application — `tbl_cls_order-19-2-2021` and `tbl_orders-21-2-2021`
 * are point-in-time copies, `tbl_user_client-issuetest` is a duplicate of the
 * client table, `tbl_migration_debug` and `tbl_myob_keys_development` are
 * working notes. They stay in the database untouched; they simply get no model,
 * because a model is an invitation to query it.
 */
const SKIPPED = new Set([
  'tbl_cls_order-19-2-2021',
  'tbl_orders-21-2-2021',
  'tbl_user_client-issuetest',
  'tbl_migration_debug',
  'tbl_myob_keys_development',
]);

interface Column {
  name: string;
  sqlType: string;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
  autoIncrement: boolean;
  primaryKey: boolean;
}

interface Table {
  name: string;
  modelName: string;
  columns: Column[];
  engine: string;
  charset: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** `tbl_cls_order_documents` → `ClsOrderDocument`-ish: strip prefix, pascal case. */
const toModelName = (table: string): string => {
  const base = table.replace(/^tbl_/, '');
  return base
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
};

const parseColumns = (body: string): Column[] => {
  const columns: Column[] = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    if (!line) continue;

    // Table-level clauses, not columns.
    if (/^(PRIMARY KEY|UNIQUE KEY|KEY|CONSTRAINT|FOREIGN KEY|INDEX)\b/i.test(line)) {
      continue;
    }

    const match = /^`([^`]+)`\s+(.+)$/.exec(line);
    if (!match) continue;

    const [, name, rest] = match;
    if (!name || !rest) continue;

    // The type is everything up to the first modifier keyword.
    const typeMatch = /^([a-z]+(?:\([^)]*\))?(?:\s+unsigned)?)/i.exec(rest);
    const sqlType = (typeMatch?.[1] ?? 'varchar(255)').toLowerCase();

    const commentMatch = /COMMENT\s+'((?:[^']|'')*)'/i.exec(rest);
    const defaultMatch = /DEFAULT\s+(CURRENT_TIMESTAMP|NULL|'(?:[^']|'')*'|[\d.-]+)/i.exec(
      rest
    );

    columns.push({
      name,
      sqlType,
      nullable: !/\bNOT NULL\b/i.test(rest),
      defaultValue: defaultMatch?.[1] ?? null,
      comment: commentMatch?.[1]?.replace(/''/g, "'") ?? null,
      autoIncrement: /\bAUTO_INCREMENT\b/i.test(rest),
      primaryKey: false,
    });
  }

  return columns;
};

const parseDump = (sql: string): Table[] => {
  const tables: Table[] = [];

  // CREATE TABLE `name` ( ...body... ) ENGINE=... ;
  const createPattern =
    /CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\)\s*ENGINE=(\w+)[^;]*?(?:DEFAULT CHARSET=(\w+))?[^;]*;/g;

  let match: RegExpExecArray | null;

  while ((match = createPattern.exec(sql)) !== null) {
    const [, name, body, engine, charset] = match;
    if (!name || !body) continue;
    if (SKIPPED.has(name)) continue;

    tables.push({
      name,
      modelName: toModelName(name),
      columns: parseColumns(body),
      engine: engine ?? 'InnoDB',
      charset: charset ?? 'latin1',
    });
  }

  // Primary keys and AUTO_INCREMENT live in the ALTER statements at the end of
  // a phpMyAdmin dump, not in the CREATE TABLE body.
  const byName = new Map(tables.map((table) => [table.name, table]));

  const pkPattern = /ALTER TABLE `([^`]+)`\s+ADD PRIMARY KEY \(`([^`]+)`\)/g;
  while ((match = pkPattern.exec(sql)) !== null) {
    const [, tableName, columnName] = match;
    const column = byName.get(tableName ?? '')?.columns.find((c) => c.name === columnName);
    if (column) column.primaryKey = true;
  }

  const aiPattern = /ALTER TABLE `([^`]+)`\s+MODIFY `([^`]+)`[^;]*AUTO_INCREMENT/g;
  while ((match = aiPattern.exec(sql)) !== null) {
    const [, tableName, columnName] = match;
    const column = byName.get(tableName ?? '')?.columns.find((c) => c.name === columnName);
    if (column) column.autoIncrement = true;
  }

  return tables;
};

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

/**
 * MySQL type to Sequelize type.
 *
 * `tinyint(1)` maps to INTEGER rather than BOOLEAN on purpose. The legacy
 * application stores 0, 1 and NULL in these columns, and in a few places other
 * small integers — `tbl_orders.status` is documented as ten different values.
 * Declaring them BOOLEAN would have Sequelize coerce `2` to `true`, which is
 * how a "completed" order starts reading as "yes".
 *
 * DATE and DATETIME map to strings because the connection runs with
 * `dateStrings: true`. The legacy rows hold local Sydney times with no zone
 * recorded, so letting the driver build `Date` objects from them would apply a
 * conversion nobody asked for. They are parsed in exactly one place instead.
 */
const mapType = (sqlType: string): { sequelize: string; ts: string } => {
  const base = sqlType.replace(/\(.*/, '').trim();
  const sizeMatch = /\(([^)]*)\)/.exec(sqlType);
  const size = sizeMatch?.[1] ?? '';

  switch (base) {
    case 'int':
    case 'integer':
    case 'tinyint':
    case 'smallint':
    case 'mediumint':
      return { sequelize: 'DataTypes.INTEGER', ts: 'number' };
    case 'bigint':
      return { sequelize: 'DataTypes.BIGINT', ts: 'string' };
    case 'double':
      return { sequelize: 'DataTypes.DOUBLE', ts: 'number' };
    case 'float':
      return {
        sequelize: size ? `DataTypes.FLOAT(${size})` : 'DataTypes.FLOAT',
        ts: 'number',
      };
    case 'decimal':
      return {
        sequelize: size ? `DataTypes.DECIMAL(${size})` : 'DataTypes.DECIMAL',
        ts: 'string',
      };
    case 'varchar':
      return { sequelize: `DataTypes.STRING(${size || 255})`, ts: 'string' };
    case 'char':
      return { sequelize: `DataTypes.CHAR(${size || 255})`, ts: 'string' };
    case 'text':
      return { sequelize: 'DataTypes.TEXT', ts: 'string' };
    case 'tinytext':
      return { sequelize: "DataTypes.TEXT('tiny')", ts: 'string' };
    case 'mediumtext':
      return { sequelize: "DataTypes.TEXT('medium')", ts: 'string' };
    case 'longtext':
      return { sequelize: "DataTypes.TEXT('long')", ts: 'string' };
    case 'date':
      return { sequelize: 'DataTypes.DATEONLY', ts: 'string' };
    case 'datetime':
    case 'timestamp':
      return { sequelize: 'DataTypes.DATE', ts: 'string' };
    case 'time':
      return { sequelize: 'DataTypes.TIME', ts: 'string' };
    case 'varbinary':
    case 'binary':
    case 'blob':
    case 'longblob':
      return { sequelize: 'DataTypes.BLOB', ts: 'Buffer' };
    default:
      return { sequelize: 'DataTypes.STRING(255)', ts: 'string' };
  }
};

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------

const quote = (value: string): string => `'${value.replace(/'/g, "\\'")}'`;

const defaultLiteral = (column: Column): string | null => {
  const raw = column.defaultValue;
  if (raw === null) return null;
  if (/^NULL$/i.test(raw)) return null;
  if (/^CURRENT_TIMESTAMP$/i.test(raw)) return 'DataTypes.NOW';

  const stringMatch = /^'((?:[^']|'')*)'$/.exec(raw);
  if (stringMatch) {
    const inner = stringMatch[1]?.replace(/''/g, "'") ?? '';
    const { ts } = mapType(column.sqlType);
    // `DEFAULT '0'` on an int column is the string zero in the dump but the
    // number zero in the table.
    return ts === 'number' ? String(Number(inner) || 0) : quote(inner);
  }

  return raw;
};

/**
 * Whether Sequelize should treat the column as optional when creating a row.
 *
 * `CreationOptional<T>` is how Sequelize 6 is told that a field need not be
 * supplied to `create()`. It applies to an AUTO_INCREMENT key and to any column
 * with a DEFAULT — without it, TypeScript demands an `id` on every insert.
 *
 * Nullable columns need no marker: `InferCreationAttributes` already treats a
 * type that admits null as optional.
 */
const isCreationOptional = (column: Column): boolean =>
  column.autoIncrement || (column.defaultValue !== null && !column.nullable);

const emitModel = (table: Table): string => {
  const pk = table.columns.find((column) => column.primaryKey);

  const attributeLines = table.columns
    .map((column) => {
      const { ts } = mapType(column.sqlType);
      const optional = column.nullable ? ' | null' : '';
      const comment = column.comment ? `  /** ${column.comment} */\n` : '';
      return `${comment}  ${column.name}: ${ts}${optional};`;
    })
    .join('\n');

  const definitionLines = table.columns
    .map((column) => {
      const { sequelize } = mapType(column.sqlType);
      const parts = [
        `      type: ${sequelize},`,
        `      allowNull: ${column.nullable},`,
      ];

      if (column.primaryKey) parts.push('      primaryKey: true,');
      if (column.autoIncrement) parts.push('      autoIncrement: true,');

      const fallback = defaultLiteral(column);
      if (fallback !== null) parts.push(`      defaultValue: ${fallback},`);

      // The column name is repeated as `field` so that renaming the attribute
      // later cannot silently change the SQL.
      parts.push(`      field: ${quote(column.name)},`);

      return `    ${column.name}: {\n${parts.join('\n')}\n    },`;
    })
    .join('\n');

  const declarations = table.columns
    .map((column) => {
      const { ts } = mapType(column.sqlType);
      const nullable = column.nullable ? ' | null' : '';
      const type = isCreationOptional(column)
        ? `CreationOptional<${ts}${nullable}>`
        : `${ts}${nullable}`;
      return `  declare ${column.name}: ${type};`;
    })
    .join('\n');

  // A handful of tables — `tbl_tpn`, `tbl_settings_passport` — have a NOT NULL
  // primary key with no AUTO_INCREMENT and no defaults anywhere, so nothing on
  // them is creation-optional and importing the type would be unused.
  const usesCreationOptional = table.columns.some(isCreationOptional);

  return `/**
 * \`${table.name}\` — ${table.engine}, ${table.charset}.
 *
 * Generated from db/schema/clspubli_staging.sql by scripts/generateModels.ts.
 * Do not edit: re-run \`npm run models:generate\` if CLS supplies a new dump.
 */
import {
  DataTypes,
  Model,${usesCreationOptional ? '\n  type CreationOptional,' : ''}
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../config/database';

/** Every column, as it is read back. Use this in presenters. */
export interface ${table.modelName}Attributes {
${attributeLines}
}

export class ${table.modelName} extends Model<
  InferAttributes<${table.modelName}>,
  InferCreationAttributes<${table.modelName}>
> {
${declarations}
}

${table.modelName}.init(
  {
${definitionLines}
  },
  {
    sequelize,
    tableName: ${quote(table.name)},
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
${pk ? '' : '    // No primary key in the dump; reads only.\n'}  }
);

export default ${table.modelName};
`;
};

const emitIndex = (tables: Table[]): string => {
  const imports = tables
    .map(
      (table) =>
        `export { ${table.modelName}, type ${table.modelName}Attributes } from './${table.modelName}';`
    )
    .join('\n');

  const registry = tables
    .map((table) => `  ${table.modelName},`)
    .join('\n');

  const importList = tables
    .map((table) => `import { ${table.modelName} } from './${table.modelName}';`)
    .join('\n');

  return `/**
 * Every table this API models, and the map from table name to model.
 *
 * Generated by scripts/generateModels.ts. Associations are NOT here — the
 * schema declares no foreign keys, so every relationship is a judgement call
 * and lives in ../associations.ts where it can be justified in writing.
 */
${importList}

${imports}

/** Keyed by the real table name, for diagnostics and the schema check script. */
export const generatedModels = {
${registry}
} as const;

export type GeneratedModelName = keyof typeof generatedModels;
`;
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const main = (): void => {
  if (!fs.existsSync(DUMP)) {
    throw new Error(`Schema dump not found at ${DUMP}`);
  }

  const sql = fs.readFileSync(DUMP, 'utf8');
  const tables = parseDump(sql);

  if (tables.length === 0) {
    throw new Error('No CREATE TABLE statements parsed — check the dump format.');
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const table of tables) {
    fs.writeFileSync(path.join(OUT_DIR, `${table.modelName}.ts`), emitModel(table));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), emitIndex(tables));

  const columnCount = tables.reduce((total, table) => total + table.columns.length, 0);

  console.log(`Generated ${tables.length} models (${columnCount} columns) into ${OUT_DIR}`);
  console.log(`Skipped ${SKIPPED.size} backup/debug tables: ${[...SKIPPED].join(', ')}`);

  const noPk = tables.filter((table) => !table.columns.some((c) => c.primaryKey));
  if (noPk.length > 0) {
    console.log(`No primary key parsed for: ${noPk.map((t) => t.name).join(', ')}`);
  }
};

main();
