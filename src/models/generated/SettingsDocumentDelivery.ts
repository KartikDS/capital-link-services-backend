/**
 * `tbl_settings_document_delivery` — MyISAM, latin1.
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
export interface SettingsDocumentDeliveryAttributes {
  id: number;
  type: string | null;
  cost: number | null;
  /** 1=enabled; 0=disabled */
  status: number | null;
}

export class SettingsDocumentDelivery extends Model<
  InferAttributes<SettingsDocumentDelivery>,
  InferCreationAttributes<SettingsDocumentDelivery>
> {
  declare id: CreationOptional<number>;
  declare type: string | null;
  declare cost: number | null;
  declare status: number | null;
}

SettingsDocumentDelivery.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    type: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'type',
    },
    cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'cost',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_settings_document_delivery',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default SettingsDocumentDelivery;
