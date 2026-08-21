/**
 * `tbl_order_police_clearance_applicants` — MyISAM, latin1.
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
export interface OrderPoliceClearanceApplicantsAttributes {
  id: number;
  order_no: number | null;
  fname: string | null;
  mname: string | null;
  lname: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  state: string | null;
  country_id: number | null;
  passport_no: string | null;
  departure_date: string | null;
}

export class OrderPoliceClearanceApplicants extends Model<
  InferAttributes<OrderPoliceClearanceApplicants>,
  InferCreationAttributes<OrderPoliceClearanceApplicants>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare fname: string | null;
  declare mname: string | null;
  declare lname: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare mobile: string | null;
  declare address: string | null;
  declare city: string | null;
  declare postcode: string | null;
  declare state: string | null;
  declare country_id: number | null;
  declare passport_no: string | null;
  declare departure_date: string | null;
}

OrderPoliceClearanceApplicants.init(
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
    phone: {
      type: DataTypes.CHAR(20),
      allowNull: true,
      field: 'phone',
    },
    mobile: {
      type: DataTypes.CHAR(20),
      allowNull: true,
      field: 'mobile',
    },
    address: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'address',
    },
    city: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'city',
    },
    postcode: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'postcode',
    },
    state: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'state',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    passport_no: {
      type: DataTypes.CHAR(200),
      allowNull: true,
      field: 'passport_no',
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_police_clearance_applicants',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderPoliceClearanceApplicants;
