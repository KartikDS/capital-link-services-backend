/**
 * `tbl_order_traveller_details` — InnoDB, latin1.
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
export interface OrderTravellerDetailsAttributes {
  id: number;
  order_id: number | null;
  title: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  nearest_capital_city: string | null;
  organisation: string | null;
  citizenship: number | null;
  occupation: string | null;
  rpinfo_fullname: string | null;
  rpinfo_position_at_post: string | null;
  rpinfo_name_of_post: string | null;
  rpinfo_city: string | null;
  nationality: number | null;
  passport_type: number | null;
  gender: string | null;
  phone: string | null;
  date_of_birth: string | null;
  passport_number: string | null;
  passport_issue_date: string | null;
  passport_expiry_date: string | null;
  departure_date: string | null;
  is_client: number | null;
  is_primary: number | null;
  status: number | null;
}

export class OrderTravellerDetails extends Model<
  InferAttributes<OrderTravellerDetails>,
  InferCreationAttributes<OrderTravellerDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare title: string | null;
  declare first_name: string | null;
  declare middle_name: string | null;
  declare last_name: string | null;
  declare email: string | null;
  declare nearest_capital_city: string | null;
  declare organisation: string | null;
  declare citizenship: number | null;
  declare occupation: string | null;
  declare rpinfo_fullname: string | null;
  declare rpinfo_position_at_post: string | null;
  declare rpinfo_name_of_post: string | null;
  declare rpinfo_city: string | null;
  declare nationality: number | null;
  declare passport_type: number | null;
  declare gender: string | null;
  declare phone: string | null;
  declare date_of_birth: string | null;
  declare passport_number: string | null;
  declare passport_issue_date: string | null;
  declare passport_expiry_date: string | null;
  declare departure_date: string | null;
  declare is_client: number | null;
  declare is_primary: number | null;
  declare status: number | null;
}

OrderTravellerDetails.init(
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'title',
    },
    first_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'first_name',
    },
    middle_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'middle_name',
    },
    last_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'last_name',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'email',
    },
    nearest_capital_city: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'nearest_capital_city',
    },
    organisation: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'organisation',
    },
    citizenship: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'citizenship',
    },
    occupation: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'occupation',
    },
    rpinfo_fullname: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'rpinfo_fullname',
    },
    rpinfo_position_at_post: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'rpinfo_position_at_post',
    },
    rpinfo_name_of_post: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'rpinfo_name_of_post',
    },
    rpinfo_city: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'rpinfo_city',
    },
    nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality',
    },
    passport_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'passport_type',
    },
    gender: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'gender',
    },
    phone: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'phone',
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'date_of_birth',
    },
    passport_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'passport_number',
    },
    passport_issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'passport_issue_date',
    },
    passport_expiry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'passport_expiry_date',
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date',
    },
    is_client: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_client',
    },
    is_primary: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_primary',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_traveller_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderTravellerDetails;
