/**
 * `tbl_additional_services` — InnoDB, latin1.
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
export interface AdditionalServicesAttributes {
  id: number;
  visa_id: number | null;
  title: string | null;
  short_description: string | null;
  charges: string | null;
  status: number | null;
}

export class AdditionalServices extends Model<
  InferAttributes<AdditionalServices>,
  InferCreationAttributes<AdditionalServices>
> {
  declare id: CreationOptional<number>;
  declare visa_id: number | null;
  declare title: string | null;
  declare short_description: string | null;
  declare charges: string | null;
  declare status: number | null;
}

AdditionalServices.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    visa_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'title',
    },
    short_description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'short_description',
    },
    charges: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'charges',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_additional_services',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default AdditionalServices;
