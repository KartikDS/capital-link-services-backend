/**
 * `tbl_settings_tpn` — InnoDB, latin1.
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
export interface SettingsTpnAttributes {
  id: number;
  tpn: number | null;
  tpn_additional: number | null;
}

export class SettingsTpn extends Model<
  InferAttributes<SettingsTpn>,
  InferCreationAttributes<SettingsTpn>
> {
  declare id: CreationOptional<number>;
  declare tpn: number | null;
  declare tpn_additional: number | null;
}

SettingsTpn.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    tpn: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'tpn',
    },
    tpn_additional: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'tpn_additional',
    },
  },
  {
    sequelize,
    tableName: 'tbl_settings_tpn',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default SettingsTpn;
