/**
 * `tbl_visa_additional_requirements` — MyISAM, latin1.
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
export interface VisaAdditionalRequirementsAttributes {
  id: number;
  visa_id: number | null;
  requirement: string | null;
  cost: number | null;
  s_required: number | null;
  /** 1=active; 0=inactive */
  status: number | null;
  item_order: number | null;
  visa_type: number | null;
}

export class VisaAdditionalRequirements extends Model<
  InferAttributes<VisaAdditionalRequirements>,
  InferCreationAttributes<VisaAdditionalRequirements>
> {
  declare id: CreationOptional<number>;
  declare visa_id: number | null;
  declare requirement: string | null;
  declare cost: number | null;
  declare s_required: number | null;
  declare status: number | null;
  declare item_order: number | null;
  declare visa_type: number | null;
}

VisaAdditionalRequirements.init(
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
    requirement: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'requirement',
    },
    cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'cost',
    },
    s_required: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_required',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    item_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'item_order',
    },
    visa_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_type',
    },
  },
  {
    sequelize,
    tableName: 'tbl_visa_additional_requirements',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default VisaAdditionalRequirements;
