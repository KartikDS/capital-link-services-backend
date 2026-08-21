/**
 * `tbl_order_doc_delivery_details` — InnoDB, latin1.
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
export interface OrderDocDeliveryDetailsAttributes {
  id: number;
  order_id: number | null;
  secuirity_number: string | null;
  contact_name: string | null;
  contact_area: string | null;
  receiver_contact_name: string | null;
  receiver_contact_area: string | null;
  primary_receipient_name: string | null;
  primary_receipient_area: string | null;
  primary_receipient_email: string | null;
  primary_receipient_contact_no: string | null;
  alternative_receipient_name_first: string | null;
  alternative_receipient_area_first: string | null;
  alternative_receipient_phone_first: string | null;
  alternative_receipient_name_second: string | null;
  alternative_receipient_area_second: string | null;
  alternative_receipient_phone_second: string | null;
  package_total_pieces: number | null;
  package_pickup_date: string | null;
  package_weight: string | null;
  package_weight_price: string | null;
  package_extra_weight: string | null;
  package_extra_weight_price: string | null;
  package_total_weight_price: string | null;
  package_ready_time_by_hr: number | null;
  package_ready_time_by_min: number | null;
  package_ready_time_by_am_pm: string | null;
  package_close_time_by_hr: number | null;
  package_close_time_by_min: number | null;
  package_close_time_by_am_pm: string | null;
  payment_doc_type: string | null;
  service_code: string | null;
  ref_no: string | null;
  is_delivered_to_embassy: number | null;
  delivered_to_embassy_date: string | null;
  date_submitted_for_processing: string | null;
  package_condition: number | null;
  comment: string | null;
}

export class OrderDocDeliveryDetails extends Model<
  InferAttributes<OrderDocDeliveryDetails>,
  InferCreationAttributes<OrderDocDeliveryDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare secuirity_number: string | null;
  declare contact_name: string | null;
  declare contact_area: string | null;
  declare receiver_contact_name: string | null;
  declare receiver_contact_area: string | null;
  declare primary_receipient_name: string | null;
  declare primary_receipient_area: string | null;
  declare primary_receipient_email: string | null;
  declare primary_receipient_contact_no: string | null;
  declare alternative_receipient_name_first: string | null;
  declare alternative_receipient_area_first: string | null;
  declare alternative_receipient_phone_first: string | null;
  declare alternative_receipient_name_second: string | null;
  declare alternative_receipient_area_second: string | null;
  declare alternative_receipient_phone_second: string | null;
  declare package_total_pieces: number | null;
  declare package_pickup_date: string | null;
  declare package_weight: string | null;
  declare package_weight_price: string | null;
  declare package_extra_weight: string | null;
  declare package_extra_weight_price: string | null;
  declare package_total_weight_price: string | null;
  declare package_ready_time_by_hr: number | null;
  declare package_ready_time_by_min: number | null;
  declare package_ready_time_by_am_pm: string | null;
  declare package_close_time_by_hr: number | null;
  declare package_close_time_by_min: number | null;
  declare package_close_time_by_am_pm: string | null;
  declare payment_doc_type: string | null;
  declare service_code: string | null;
  declare ref_no: string | null;
  declare is_delivered_to_embassy: number | null;
  declare delivered_to_embassy_date: string | null;
  declare date_submitted_for_processing: string | null;
  declare package_condition: number | null;
  declare comment: string | null;
}

OrderDocDeliveryDetails.init(
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
    secuirity_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'secuirity_number',
    },
    contact_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_name',
    },
    contact_area: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_area',
    },
    receiver_contact_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'receiver_contact_name',
    },
    receiver_contact_area: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'receiver_contact_area',
    },
    primary_receipient_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'primary_receipient_name',
    },
    primary_receipient_area: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'primary_receipient_area',
    },
    primary_receipient_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'primary_receipient_email',
    },
    primary_receipient_contact_no: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'primary_receipient_contact_no',
    },
    alternative_receipient_name_first: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'alternative_receipient_name_first',
    },
    alternative_receipient_area_first: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'alternative_receipient_area_first',
    },
    alternative_receipient_phone_first: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'alternative_receipient_phone_first',
    },
    alternative_receipient_name_second: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'alternative_receipient_name_second',
    },
    alternative_receipient_area_second: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'alternative_receipient_area_second',
    },
    alternative_receipient_phone_second: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'alternative_receipient_phone_second',
    },
    package_total_pieces: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_total_pieces',
    },
    package_pickup_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'package_pickup_date',
    },
    package_weight: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_weight',
    },
    package_weight_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_weight_price',
    },
    package_extra_weight: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_extra_weight',
    },
    package_extra_weight_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_extra_weight_price',
    },
    package_total_weight_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_total_weight_price',
    },
    package_ready_time_by_hr: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_ready_time_by_hr',
    },
    package_ready_time_by_min: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_ready_time_by_min',
    },
    package_ready_time_by_am_pm: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_ready_time_by_am_pm',
    },
    package_close_time_by_hr: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_close_time_by_hr',
    },
    package_close_time_by_min: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_close_time_by_min',
    },
    package_close_time_by_am_pm: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'package_close_time_by_am_pm',
    },
    payment_doc_type: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'payment_doc_type',
    },
    service_code: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'service_code',
    },
    ref_no: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'ref_no',
    },
    is_delivered_to_embassy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_delivered_to_embassy',
    },
    delivered_to_embassy_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'delivered_to_embassy_date',
    },
    date_submitted_for_processing: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_submitted_for_processing',
    },
    package_condition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_condition',
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'comment',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_doc_delivery_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderDocDeliveryDetails;
