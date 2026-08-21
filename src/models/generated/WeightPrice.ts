/**
 * `tbl_weight_price` — InnoDB, latin1.
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
export interface WeightPriceAttributes {
  id: number;
  weight_upper_limit: number;
  weight_lower_limit: number;
  price: number;
}

export class WeightPrice extends Model<
  InferAttributes<WeightPrice>,
  InferCreationAttributes<WeightPrice>
> {
  declare id: CreationOptional<number>;
  declare weight_upper_limit: number;
  declare weight_lower_limit: number;
  declare price: number;
}

WeightPrice.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    weight_upper_limit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'weight_upper_limit',
    },
    weight_lower_limit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'weight_lower_limit',
    },
    price: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      field: 'price',
    },
  },
  {
    sequelize,
    tableName: 'tbl_weight_price',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default WeightPrice;
