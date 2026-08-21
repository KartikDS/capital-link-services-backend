/**
 * `tbl_visa_courier_options` — MyISAM, latin1.
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
export interface VisaCourierOptionsAttributes {
  id: number;
  type: string | null;
  cost: number | null;
  courier_icon: string | null;
  /** 1=Active; 0=Inactive */
  s_active: number | null;
  /** 1=yes; 0=no */
  s_available_for_gov: number | null;
  /** 1=yes; 0=no */
  s_available_for_public: number | null;
  /** 1=yes; 0=no */
  s_dhl: number | null;
  is_courier_service: number | null;
  is_airport_to_airport: number | null;
  is_document_delivery: number | null;
}

export class VisaCourierOptions extends Model<
  InferAttributes<VisaCourierOptions>,
  InferCreationAttributes<VisaCourierOptions>
> {
  declare id: CreationOptional<number>;
  declare type: string | null;
  declare cost: number | null;
  declare courier_icon: string | null;
  declare s_active: number | null;
  declare s_available_for_gov: number | null;
  declare s_available_for_public: number | null;
  declare s_dhl: number | null;
  declare is_courier_service: number | null;
  declare is_airport_to_airport: number | null;
  declare is_document_delivery: number | null;
}

VisaCourierOptions.init(
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
    courier_icon: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_icon',
    },
    s_active: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_active',
    },
    s_available_for_gov: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_available_for_gov',
    },
    s_available_for_public: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_available_for_public',
    },
    s_dhl: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_dhl',
    },
    is_courier_service: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_courier_service',
    },
    is_airport_to_airport: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_airport_to_airport',
    },
    is_document_delivery: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_document_delivery',
    },
  },
  {
    sequelize,
    tableName: 'tbl_visa_courier_options',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default VisaCourierOptions;
