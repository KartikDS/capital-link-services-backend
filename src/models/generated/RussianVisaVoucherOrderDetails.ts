/**
 * `tbl_russian_visa_voucher_order_details` — InnoDB, latin1.
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
export interface RussianVisaVoucherOrderDetailsAttributes {
  id: number;
  order_id: number | null;
  russian_visa_voucher_id: number | null;
  voucher_col: number | null;
  voucher_col_cost: string | null;
  first_entry_date: string | null;
  first_departure_date: string | null;
  double_entry_date: string | null;
  double_departure_date: string | null;
  multiple_entry_date: string | null;
  multiple_departure_date: string | null;
  list_of_cities: string | null;
  list_of_hotels: string | null;
  visa_applied_at: string | null;
  passport_file: string | null;
  comment: string | null;
  company: string | null;
  position: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country_id: number | null;
  company_phone: string | null;
  date_cls_received_all_items: string | null;
  date_submitted_for_processing: string | null;
  date_completed_and_received_at_cls: string | null;
  date_order_on_route_and_closed: string | null;
  address: string | null;
  status: number | null;
}

export class RussianVisaVoucherOrderDetails extends Model<
  InferAttributes<RussianVisaVoucherOrderDetails>,
  InferCreationAttributes<RussianVisaVoucherOrderDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare russian_visa_voucher_id: number | null;
  declare voucher_col: number | null;
  declare voucher_col_cost: string | null;
  declare first_entry_date: string | null;
  declare first_departure_date: string | null;
  declare double_entry_date: string | null;
  declare double_departure_date: string | null;
  declare multiple_entry_date: string | null;
  declare multiple_departure_date: string | null;
  declare list_of_cities: string | null;
  declare list_of_hotels: string | null;
  declare visa_applied_at: string | null;
  declare passport_file: string | null;
  declare comment: string | null;
  declare company: string | null;
  declare position: string | null;
  declare city: string | null;
  declare state: string | null;
  declare postcode: string | null;
  declare country_id: number | null;
  declare company_phone: string | null;
  declare date_cls_received_all_items: string | null;
  declare date_submitted_for_processing: string | null;
  declare date_completed_and_received_at_cls: string | null;
  declare date_order_on_route_and_closed: string | null;
  declare address: string | null;
  declare status: number | null;
}

RussianVisaVoucherOrderDetails.init(
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
    russian_visa_voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'russian_visa_voucher_id',
    },
    voucher_col: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'voucher_col',
    },
    voucher_col_cost: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'voucher_col_cost',
    },
    first_entry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'first_entry_date',
    },
    first_departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'first_departure_date',
    },
    double_entry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'double_entry_date',
    },
    double_departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'double_departure_date',
    },
    multiple_entry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'multiple_entry_date',
    },
    multiple_departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'multiple_departure_date',
    },
    list_of_cities: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'list_of_cities',
    },
    list_of_hotels: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'list_of_hotels',
    },
    visa_applied_at: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_applied_at',
    },
    passport_file: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'passport_file',
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'comment',
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'company',
    },
    position: {
      type: DataTypes.CHAR(255),
      allowNull: true,
      field: 'position',
    },
    city: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'city',
    },
    state: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'state',
    },
    postcode: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'postcode',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    company_phone: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'company_phone',
    },
    date_cls_received_all_items: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_cls_received_all_items',
    },
    date_submitted_for_processing: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_submitted_for_processing',
    },
    date_completed_and_received_at_cls: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_completed_and_received_at_cls',
    },
    date_order_on_route_and_closed: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_order_on_route_and_closed',
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'address',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_russian_visa_voucher_order_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default RussianVisaVoucherOrderDetails;
