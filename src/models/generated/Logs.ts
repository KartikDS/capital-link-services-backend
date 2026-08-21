/**
 * `tbl_logs` — InnoDB, latin1.
 *
 * Generated from db/schema/clspubli_staging.sql by scripts/generateModels.ts.
 * Do not edit: re-run `npm run models:generate` if CLS supplies a new dump.
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../config/database';

/** Every column, as it is read back. Use this in presenters. */
export interface LogsAttributes {
  log_id: number;
  /** admin; dfat; client */
  area: string | null;
  user_id: number | null;
  user_type: string | null;
  log_datetime: string | null;
  log_details: string | null;
}

export class Logs extends Model<
  InferAttributes<Logs>,
  InferCreationAttributes<Logs>
> {
  declare log_id: CreationOptional<number>;
  declare area: string | null;
  declare user_id: number | null;
  declare user_type: string | null;
  declare log_datetime: string | null;
  declare log_details: string | null;
}

Logs.init(
  {
    log_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'log_id',
    },
    area: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'area',
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id',
    },
    user_type: {
      type: DataTypes.CHAR(20),
      allowNull: true,
      field: 'user_type',
    },
    log_datetime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'log_datetime',
    },
    log_details: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'log_details',
    },
  },
  {
    sequelize,
    tableName: 'tbl_logs',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Logs;
