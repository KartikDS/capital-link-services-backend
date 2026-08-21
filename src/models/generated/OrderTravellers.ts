/**
 * `tbl_order_travellers` — InnoDB, latin1.
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
export interface OrderTravellersAttributes {
  id: number;
  order_no: number | null;
  title: number | null;
  fname: string | null;
  mname: string | null;
  lname: string | null;
  email: string | null;
  /** male; female */
  gender: string | null;
  nearest_capital_city: string | null;
  organisation: string | null;
  occupation: string | null;
  rpinfo_fullname: string | null;
  rpinfo_position_at_post: string | null;
  rpinfo_name_of_post: string | null;
  rpinfo_city: string | null;
  phone: string | null;
  birth_date: string | null;
  /** country_id */
  nationality: number | null;
  passport_number: string | null;
  passport_type: number | null;
  s_primary: number | null;
  rvv_citizenship: string | null;
  rvv_sex: string | null;
  rvv_birth_place: string | null;
  rvv_passport_issue_date: string | null;
  rvv_passport_exp_date: string | null;
  rvv_company: string | null;
  rvv_position: string | null;
  rvv_city: string | null;
  rvv_state: string | null;
  rvv_postcode: string | null;
  rvv_country: number | null;
  rvv_company_fax: string | null;
  rvv_address: string | null;
}

export class OrderTravellers extends Model<
  InferAttributes<OrderTravellers>,
  InferCreationAttributes<OrderTravellers>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare title: number | null;
  declare fname: string | null;
  declare mname: string | null;
  declare lname: string | null;
  declare email: string | null;
  declare gender: string | null;
  declare nearest_capital_city: string | null;
  declare organisation: string | null;
  declare occupation: string | null;
  declare rpinfo_fullname: string | null;
  declare rpinfo_position_at_post: string | null;
  declare rpinfo_name_of_post: string | null;
  declare rpinfo_city: string | null;
  declare phone: string | null;
  declare birth_date: string | null;
  declare nationality: number | null;
  declare passport_number: string | null;
  declare passport_type: number | null;
  declare s_primary: number | null;
  declare rvv_citizenship: string | null;
  declare rvv_sex: string | null;
  declare rvv_birth_place: string | null;
  declare rvv_passport_issue_date: string | null;
  declare rvv_passport_exp_date: string | null;
  declare rvv_company: string | null;
  declare rvv_position: string | null;
  declare rvv_city: string | null;
  declare rvv_state: string | null;
  declare rvv_postcode: string | null;
  declare rvv_country: number | null;
  declare rvv_company_fax: string | null;
  declare rvv_address: string | null;
}

OrderTravellers.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    order_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_no',
    },
    title: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'title',
    },
    fname: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'fname',
    },
    mname: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'mname',
    },
    lname: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'lname',
    },
    email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'email',
    },
    gender: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'gender',
    },
    nearest_capital_city: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'nearest_capital_city',
    },
    organisation: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'organisation',
    },
    occupation: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'occupation',
    },
    rpinfo_fullname: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'rpinfo_fullname',
    },
    rpinfo_position_at_post: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'rpinfo_position_at_post',
    },
    rpinfo_name_of_post: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'rpinfo_name_of_post',
    },
    rpinfo_city: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'rpinfo_city',
    },
    phone: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'phone',
    },
    birth_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'birth_date',
    },
    nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality',
    },
    passport_number: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'passport_number',
    },
    passport_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'passport_type',
    },
    s_primary: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_primary',
    },
    rvv_citizenship: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_citizenship',
    },
    rvv_sex: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'rvv_sex',
    },
    rvv_birth_place: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_birth_place',
    },
    rvv_passport_issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rvv_passport_issue_date',
    },
    rvv_passport_exp_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rvv_passport_exp_date',
    },
    rvv_company: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_company',
    },
    rvv_position: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_position',
    },
    rvv_city: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_city',
    },
    rvv_state: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_state',
    },
    rvv_postcode: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'rvv_postcode',
    },
    rvv_country: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'rvv_country',
    },
    rvv_company_fax: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'rvv_company_fax',
    },
    rvv_address: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_address',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_travellers',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderTravellers;
