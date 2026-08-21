/**
 * `tbl_order_destination_add_reqs_for_visa` — MyISAM, latin1.
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
export interface OrderDestinationAddReqsForVisaAttributes {
  id: number;
  visa_req_id: number | null;
  visa_req_price: number | null;
}

export class OrderDestinationAddReqsForVisa extends Model<
  InferAttributes<OrderDestinationAddReqsForVisa>,
  InferCreationAttributes<OrderDestinationAddReqsForVisa>
> {
  declare id: CreationOptional<number>;
  declare visa_req_id: number | null;
  declare visa_req_price: number | null;
}

OrderDestinationAddReqsForVisa.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    visa_req_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_req_id',
    },
    visa_req_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'visa_req_price',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_destination_add_reqs_for_visa',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderDestinationAddReqsForVisa;
