/**
 * `tbl_order_courier_service_details` — InnoDB, latin1.
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
export interface OrderCourierServiceDetailsAttributes {
  id: number;
  order_id: number | null;
  courier_service_id: number | null;
  country_id: number | null;
  courier_pickup_date: string | null;
  courier_pickup_ready_by_time_hr: string | null;
  courier_pickup_ready_by_time_min: string | null;
  courier_pickup_close_time_hr: string | null;
  courier_pickup_close_time_min: string | null;
  courier_pickup_first_name: string | null;
  courier_pickup_last_name: string | null;
  courier_pickup_email: string | null;
  courier_pickup_contact_number: string | null;
  courier_pickup_company: string | null;
  courier_pickup_address: string | null;
  courier_pickup_city: string | null;
  courier_pickup_state: string | null;
  courier_pickup_country_id: number | null;
  courier_pickup_postcode: string | null;
  courier_pickup_additional_comment: string | null;
}

export class OrderCourierServiceDetails extends Model<
  InferAttributes<OrderCourierServiceDetails>,
  InferCreationAttributes<OrderCourierServiceDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare courier_service_id: number | null;
  declare country_id: number | null;
  declare courier_pickup_date: string | null;
  declare courier_pickup_ready_by_time_hr: string | null;
  declare courier_pickup_ready_by_time_min: string | null;
  declare courier_pickup_close_time_hr: string | null;
  declare courier_pickup_close_time_min: string | null;
  declare courier_pickup_first_name: string | null;
  declare courier_pickup_last_name: string | null;
  declare courier_pickup_email: string | null;
  declare courier_pickup_contact_number: string | null;
  declare courier_pickup_company: string | null;
  declare courier_pickup_address: string | null;
  declare courier_pickup_city: string | null;
  declare courier_pickup_state: string | null;
  declare courier_pickup_country_id: number | null;
  declare courier_pickup_postcode: string | null;
  declare courier_pickup_additional_comment: string | null;
}

OrderCourierServiceDetails.init(
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
    courier_service_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'courier_service_id',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    courier_pickup_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'courier_pickup_date',
    },
    courier_pickup_ready_by_time_hr: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_ready_by_time_hr',
    },
    courier_pickup_ready_by_time_min: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_ready_by_time_min',
    },
    courier_pickup_close_time_hr: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_close_time_hr',
    },
    courier_pickup_close_time_min: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_close_time_min',
    },
    courier_pickup_first_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_first_name',
    },
    courier_pickup_last_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_last_name',
    },
    courier_pickup_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_email',
    },
    courier_pickup_contact_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_contact_number',
    },
    courier_pickup_company: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_company',
    },
    courier_pickup_address: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_address',
    },
    courier_pickup_city: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_city',
    },
    courier_pickup_state: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_state',
    },
    courier_pickup_country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'courier_pickup_country_id',
    },
    courier_pickup_postcode: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_pickup_postcode',
    },
    courier_pickup_additional_comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'courier_pickup_additional_comment',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_courier_service_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderCourierServiceDetails;
