/**
 * `tbl_order_bulk_public_visa_details` — InnoDB, latin1.
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
export interface OrderBulkPublicVisaDetailsAttributes {
  id: number;
  bulk_order_no: number | null;
  destination: number | null;
  departure_date: string | null;
  entry_date_country: string | null;
  departure_date_country: string | null;
  travel_purpose: string | null;
  selected_visa_type: number | null;
  selected_visa_type_price: number | null;
  selected_visa_type_requirements: string | null;
  visa_courier: number | null;
  visa_courier_price: number | null;
  traveller_title: number | null;
  traveller_fname: string | null;
  traveller_mname: string | null;
  traveller_lname: string | null;
  traveller_email: string | null;
  traveller_occupation: string | null;
  traveller_phone: string | null;
  traveller_bday: string | null;
  traveller_passport_type: number | null;
  traveller_nationality: number | null;
  traveller_passport_no: string | null;
  is_smart_traveller: number | null;
  dd_company: string | null;
  dd_doc_return_address: string | null;
  dd_city: string | null;
  dd_state: string | null;
  dd_postcode: string | null;
  dd_fname: string | null;
  dd_lname: string | null;
  dd_contact_no: string | null;
  dd_additional_comment: string | null;
  discount_rate: number | null;
  discount_code: string | null;
  total: number | null;
  final_total: number | null;
  generated_order_no: number | null;
  travellers: string | null;
}

export class OrderBulkPublicVisaDetails extends Model<
  InferAttributes<OrderBulkPublicVisaDetails>,
  InferCreationAttributes<OrderBulkPublicVisaDetails>
> {
  declare id: CreationOptional<number>;
  declare bulk_order_no: number | null;
  declare destination: number | null;
  declare departure_date: string | null;
  declare entry_date_country: string | null;
  declare departure_date_country: string | null;
  declare travel_purpose: string | null;
  declare selected_visa_type: number | null;
  declare selected_visa_type_price: number | null;
  declare selected_visa_type_requirements: string | null;
  declare visa_courier: number | null;
  declare visa_courier_price: number | null;
  declare traveller_title: number | null;
  declare traveller_fname: string | null;
  declare traveller_mname: string | null;
  declare traveller_lname: string | null;
  declare traveller_email: string | null;
  declare traveller_occupation: string | null;
  declare traveller_phone: string | null;
  declare traveller_bday: string | null;
  declare traveller_passport_type: number | null;
  declare traveller_nationality: number | null;
  declare traveller_passport_no: string | null;
  declare is_smart_traveller: number | null;
  declare dd_company: string | null;
  declare dd_doc_return_address: string | null;
  declare dd_city: string | null;
  declare dd_state: string | null;
  declare dd_postcode: string | null;
  declare dd_fname: string | null;
  declare dd_lname: string | null;
  declare dd_contact_no: string | null;
  declare dd_additional_comment: string | null;
  declare discount_rate: number | null;
  declare discount_code: string | null;
  declare total: number | null;
  declare final_total: number | null;
  declare generated_order_no: number | null;
  declare travellers: string | null;
}

OrderBulkPublicVisaDetails.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    bulk_order_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bulk_order_no',
    },
    destination: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'destination',
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date',
    },
    entry_date_country: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'entry_date_country',
    },
    departure_date_country: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date_country',
    },
    travel_purpose: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'travel_purpose',
    },
    selected_visa_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'selected_visa_type',
    },
    selected_visa_type_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'selected_visa_type_price',
    },
    selected_visa_type_requirements: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'selected_visa_type_requirements',
    },
    visa_courier: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_courier',
    },
    visa_courier_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'visa_courier_price',
    },
    traveller_title: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'traveller_title',
    },
    traveller_fname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'traveller_fname',
    },
    traveller_mname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'traveller_mname',
    },
    traveller_lname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'traveller_lname',
    },
    traveller_email: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'traveller_email',
    },
    traveller_occupation: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'traveller_occupation',
    },
    traveller_phone: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'traveller_phone',
    },
    traveller_bday: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'traveller_bday',
    },
    traveller_passport_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'traveller_passport_type',
    },
    traveller_nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'traveller_nationality',
    },
    traveller_passport_no: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'traveller_passport_no',
    },
    is_smart_traveller: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_smart_traveller',
    },
    dd_company: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_company',
    },
    dd_doc_return_address: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dd_doc_return_address',
    },
    dd_city: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_city',
    },
    dd_state: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_state',
    },
    dd_postcode: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'dd_postcode',
    },
    dd_fname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_fname',
    },
    dd_lname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_lname',
    },
    dd_contact_no: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'dd_contact_no',
    },
    dd_additional_comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dd_additional_comment',
    },
    discount_rate: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'discount_rate',
    },
    discount_code: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'discount_code',
    },
    total: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'total',
    },
    final_total: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'final_total',
    },
    generated_order_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'generated_order_no',
    },
    travellers: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'travellers',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_bulk_public_visa_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderBulkPublicVisaDetails;
