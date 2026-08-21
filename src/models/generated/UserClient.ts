/**
 * `tbl_user_client` — InnoDB, latin1.
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
export interface UserClientAttributes {
  id: number;
  /** government, public, corporate */
  type: string | null;
  display_id: string | null;
  title: string | null;
  fname: string | null;
  lname: string | null;
  password: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  profile_pic: string | null;
  department_id: number | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country_id: number | null;
  mdda_address: string | null;
  mdda_city: string | null;
  mdda_state: string | null;
  mdda_postcode: string | null;
  mdda_country_id: number | null;
  mba_address: string | null;
  mba_city: string | null;
  mba_state: string | null;
  mba_postcode: string | null;
  mba_country_id: number | null;
  passport_number: string | null;
  passport_photo: string | null;
  /** 1=yes; 0=no */
  can_charge_cost_to_account: number | null;
  account_no: string | null;
  /** 1=yes; 0=no */
  can_get_special_price: number | null;
  special_price: number | null;
  reset_pin: string | null;
  s_enabled: number | null;
  s_archive: number | null;
  activation_code: string | null;
  /** 0=>'not confirmed',1=>'confirmed' */
  is_address_confirmed: number | null;
  last_login: string | null;
  passport_updated_at: string | null;
}

export class UserClient extends Model<
  InferAttributes<UserClient>,
  InferCreationAttributes<UserClient>
> {
  declare id: CreationOptional<number>;
  declare type: string | null;
  declare display_id: string | null;
  declare title: string | null;
  declare fname: string | null;
  declare lname: string | null;
  declare password: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare mobile: string | null;
  declare profile_pic: string | null;
  declare department_id: number | null;
  declare company: string | null;
  declare address: string | null;
  declare city: string | null;
  declare state: string | null;
  declare postcode: string | null;
  declare country_id: number | null;
  declare mdda_address: string | null;
  declare mdda_city: string | null;
  declare mdda_state: string | null;
  declare mdda_postcode: string | null;
  declare mdda_country_id: number | null;
  declare mba_address: string | null;
  declare mba_city: string | null;
  declare mba_state: string | null;
  declare mba_postcode: string | null;
  declare mba_country_id: number | null;
  declare passport_number: string | null;
  declare passport_photo: string | null;
  declare can_charge_cost_to_account: number | null;
  declare account_no: string | null;
  declare can_get_special_price: number | null;
  declare special_price: number | null;
  declare reset_pin: string | null;
  declare s_enabled: number | null;
  declare s_archive: number | null;
  declare activation_code: string | null;
  declare is_address_confirmed: number | null;
  declare last_login: string | null;
  declare passport_updated_at: string | null;
}

UserClient.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    type: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'type',
    },
    display_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'display_id',
    },
    title: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'title',
    },
    fname: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'fname',
    },
    lname: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'lname',
    },
    password: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'password',
    },
    email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'email',
    },
    phone: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'phone',
    },
    mobile: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'mobile',
    },
    profile_pic: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'profile_pic',
    },
    department_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'department_id',
    },
    company: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'company',
    },
    address: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'address',
    },
    city: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'city',
    },
    state: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'state',
    },
    postcode: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'postcode',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    mdda_address: {
      type: DataTypes.STRING(5000),
      allowNull: true,
      field: 'mdda_address',
    },
    mdda_city: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'mdda_city',
    },
    mdda_state: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'mdda_state',
    },
    mdda_postcode: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'mdda_postcode',
    },
    mdda_country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'mdda_country_id',
    },
    mba_address: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'mba_address',
    },
    mba_city: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'mba_city',
    },
    mba_state: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'mba_state',
    },
    mba_postcode: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'mba_postcode',
    },
    mba_country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'mba_country_id',
    },
    passport_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'passport_number',
    },
    passport_photo: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'passport_photo',
    },
    can_charge_cost_to_account: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'can_charge_cost_to_account',
    },
    account_no: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'account_no',
    },
    can_get_special_price: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'can_get_special_price',
    },
    special_price: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'special_price',
    },
    reset_pin: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'reset_pin',
    },
    s_enabled: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_enabled',
    },
    s_archive: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_archive',
    },
    activation_code: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'activation_code',
    },
    is_address_confirmed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'is_address_confirmed',
    },
    last_login: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'last_login',
    },
    passport_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'passport_updated_at',
    },
  },
  {
    sequelize,
    tableName: 'tbl_user_client',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default UserClient;
