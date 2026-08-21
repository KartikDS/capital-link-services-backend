/**
 * `tbl_countries` — InnoDB, latin1.
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
export interface CountriesAttributes {
  id: number;
  country_code: string | null;
  country_name: string | null;
  country_name_display: string | null;
  rep_name: string | null;
  visa_information: string | null;
  country_details: string | null;
  main_display: number | null;
  s_popular_destination: number | null;
  priority: number | null;
  public_s_no_visa_required: number | null;
  public_s_no_visa_required_html: string | null;
  gov_s_no_visa_required: number | null;
  gov_s_no_visa_required_html: string | null;
  disabled: number | null;
  embassy_address_line1: string | null;
  embassy_address_line2: string | null;
  embassy_street: string | null;
  embassy_city: string | null;
  embassy_state: string | null;
  embassy_postcode: string | null;
  embassy_phone: string | null;
  country_image: string | null;
  country_banner_image: string | null;
  country_application_form: string | null;
  police_clearances: number | null;
  secure_document_delivery: number | null;
  document_legalisation: number | null;
  translation_services: number | null;
  is_cls: number | null;
  cls_description: string | null;
  cls_service_fee: string | null;
  standard_service_fee: string | null;
}

export class Countries extends Model<
  InferAttributes<Countries>,
  InferCreationAttributes<Countries>
> {
  declare id: CreationOptional<number>;
  declare country_code: string | null;
  declare country_name: string | null;
  declare country_name_display: string | null;
  declare rep_name: string | null;
  declare visa_information: string | null;
  declare country_details: string | null;
  declare main_display: number | null;
  declare s_popular_destination: number | null;
  declare priority: number | null;
  declare public_s_no_visa_required: number | null;
  declare public_s_no_visa_required_html: string | null;
  declare gov_s_no_visa_required: number | null;
  declare gov_s_no_visa_required_html: string | null;
  declare disabled: number | null;
  declare embassy_address_line1: string | null;
  declare embassy_address_line2: string | null;
  declare embassy_street: string | null;
  declare embassy_city: string | null;
  declare embassy_state: string | null;
  declare embassy_postcode: string | null;
  declare embassy_phone: string | null;
  declare country_image: string | null;
  declare country_banner_image: string | null;
  declare country_application_form: string | null;
  declare police_clearances: number | null;
  declare secure_document_delivery: number | null;
  declare document_legalisation: number | null;
  declare translation_services: number | null;
  declare is_cls: number | null;
  declare cls_description: string | null;
  declare cls_service_fee: string | null;
  declare standard_service_fee: string | null;
}

Countries.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    country_code: {
      type: DataTypes.STRING(11),
      allowNull: true,
      defaultValue: '',
      field: 'country_code',
    },
    country_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: '',
      field: 'country_name',
    },
    country_name_display: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'country_name_display',
    },
    rep_name: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'rep_name',
    },
    visa_information: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'visa_information',
    },
    country_details: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'country_details',
    },
    main_display: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'main_display',
    },
    s_popular_destination: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_popular_destination',
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'priority',
    },
    public_s_no_visa_required: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'public_s_no_visa_required',
    },
    public_s_no_visa_required_html: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'public_s_no_visa_required_html',
    },
    gov_s_no_visa_required: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gov_s_no_visa_required',
    },
    gov_s_no_visa_required_html: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'gov_s_no_visa_required_html',
    },
    disabled: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'disabled',
    },
    embassy_address_line1: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'embassy_address_line1',
    },
    embassy_address_line2: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'embassy_address_line2',
    },
    embassy_street: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'embassy_street',
    },
    embassy_city: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'embassy_city',
    },
    embassy_state: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'embassy_state',
    },
    embassy_postcode: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'embassy_postcode',
    },
    embassy_phone: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'embassy_phone',
    },
    country_image: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'country_image',
    },
    country_banner_image: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'country_banner_image',
    },
    country_application_form: {
      type: DataTypes.STRING(250),
      allowNull: true,
      field: 'country_application_form',
    },
    police_clearances: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'police_clearances',
    },
    secure_document_delivery: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'secure_document_delivery',
    },
    document_legalisation: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'document_legalisation',
    },
    translation_services: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'translation_services',
    },
    is_cls: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_cls',
    },
    cls_description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'cls_description',
    },
    cls_service_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'cls_service_fee',
    },
    standard_service_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'standard_service_fee',
    },
  },
  {
    sequelize,
    tableName: 'tbl_countries',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Countries;
