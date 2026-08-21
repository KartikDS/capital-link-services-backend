/**
 * `tbl_cost_editability` — InnoDB, latin1.
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
export interface CostEditabilityAttributes {
  id: number;
  country_id: number;
  title: string;
  description: string;
}

export class CostEditability extends Model<
  InferAttributes<CostEditability>,
  InferCreationAttributes<CostEditability>
> {
  declare id: CreationOptional<number>;
  declare country_id: number;
  declare title: string;
  declare description: string;
}

CostEditability.init(
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
      allowNull: false,
      field: 'country_id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'title',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'description',
    },
  },
  {
    sequelize,
    tableName: 'tbl_cost_editability',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default CostEditability;
