/**
 * `tbl_settings_discount` — InnoDB, latin1.
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
export interface SettingsDiscountAttributes {
  id: number;
  name: string | null;
  code: Buffer | null;
  rate: number | null;
}

export class SettingsDiscount extends Model<
  InferAttributes<SettingsDiscount>,
  InferCreationAttributes<SettingsDiscount>
> {
  declare id: CreationOptional<number>;
  declare name: string | null;
  declare code: Buffer | null;
  declare rate: number | null;
}

SettingsDiscount.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    name: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'name',
    },
    code: {
      type: DataTypes.BLOB,
      allowNull: true,
      field: 'code',
    },
    rate: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'rate',
    },
  },
  {
    sequelize,
    tableName: 'tbl_settings_discount',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default SettingsDiscount;
