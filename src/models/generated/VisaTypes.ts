/**
 * `tbl_visa_types` — MyISAM, latin1.
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
export interface VisaTypesAttributes {
  id: number;
  country_id: number | null;
  type: string | null;
  cost: number | null;
  file_attachment: string | null;
  second_file_attachment: string | null;
  visa_information: string | null;
  /** 1=active; 0=inactive */
  status: number | null;
}

export class VisaTypes extends Model<
  InferAttributes<VisaTypes>,
  InferCreationAttributes<VisaTypes>
> {
  declare id: CreationOptional<number>;
  declare country_id: number | null;
  declare type: string | null;
  declare cost: number | null;
  declare file_attachment: string | null;
  declare second_file_attachment: string | null;
  declare visa_information: string | null;
  declare status: number | null;
}

VisaTypes.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    type: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'type',
    },
    cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'cost',
    },
    file_attachment: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'file_attachment',
    },
    second_file_attachment: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'second_file_attachment',
    },
    visa_information: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'visa_information',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_visa_types',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default VisaTypes;
