/**
 * `tbl_myob_keys` — InnoDB, latin1.
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
export interface MyobKeysAttributes {
  id: number;
  access_token: string;
  refresh_token: string;
  access_code: string | null;
  expire_in: string;
  created: string;
  updated: string;
}

export class MyobKeys extends Model<
  InferAttributes<MyobKeys>,
  InferCreationAttributes<MyobKeys>
> {
  declare id: CreationOptional<number>;
  declare access_token: string;
  declare refresh_token: string;
  declare access_code: string | null;
  declare expire_in: string;
  declare created: string;
  declare updated: string;
}

MyobKeys.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    access_token: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'access_token',
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'refresh_token',
    },
    access_code: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'access_code',
    },
    expire_in: {
      type: DataTypes.STRING(225),
      allowNull: false,
      field: 'expire_in',
    },
    created: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created',
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated',
    },
  },
  {
    sequelize,
    tableName: 'tbl_myob_keys',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default MyobKeys;
