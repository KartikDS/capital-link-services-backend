/**
 * `tbl_general_settings` — InnoDB, latin1.
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
export interface GeneralSettingsAttributes {
  id: number;
  title: string;
  slug: string;
  field_type: string | null;
  value: string | null;
  status: number | null;
  created: string;
  updated: string;
}

export class GeneralSettings extends Model<
  InferAttributes<GeneralSettings>,
  InferCreationAttributes<GeneralSettings>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare slug: string;
  declare field_type: string | null;
  declare value: string | null;
  declare status: number | null;
  declare created: string;
  declare updated: string;
}

GeneralSettings.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'title',
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'slug',
    },
    field_type: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'field_type',
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'value',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
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
    tableName: 'tbl_general_settings',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default GeneralSettings;
