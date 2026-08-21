/**
 * `tbl_settings_passport` — MyISAM, latin1.
 *
 * Generated from db/schema/clspubli_staging.sql by scripts/generateModels.ts.
 * Do not edit: re-run `npm run models:generate` if CLS supplies a new dump.
 */
import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../config/database';

/** Every column, as it is read back. Use this in presenters. */
export interface SettingsPassportAttributes {
  id: number;
  cost: number | null;
  additional_cost: number | null;
}

export class SettingsPassport extends Model<
  InferAttributes<SettingsPassport>,
  InferCreationAttributes<SettingsPassport>
> {
  declare id: number;
  declare cost: number | null;
  declare additional_cost: number | null;
}

SettingsPassport.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'id',
    },
    cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'cost',
    },
    additional_cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'additional_cost',
    },
  },
  {
    sequelize,
    tableName: 'tbl_settings_passport',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default SettingsPassport;
