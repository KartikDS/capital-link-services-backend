/**
 * `tbl_order_additional_services` — InnoDB, latin1.
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
export interface OrderAdditionalServicesAttributes {
  id: number;
  order_id: number | null;
  additional_service_id: number | null;
  additional_service_fee: string | null;
}

export class OrderAdditionalServices extends Model<
  InferAttributes<OrderAdditionalServices>,
  InferCreationAttributes<OrderAdditionalServices>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare additional_service_id: number | null;
  declare additional_service_fee: string | null;
}

OrderAdditionalServices.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_id',
    },
    additional_service_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'additional_service_id',
    },
    additional_service_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'additional_service_fee',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_additional_services',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderAdditionalServices;
