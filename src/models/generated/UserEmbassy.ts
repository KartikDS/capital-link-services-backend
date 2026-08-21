/**
 * `tbl_user_embassy` — InnoDB, latin1.
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
export interface UserEmbassyAttributes {
  id: number;
  country: number | null;
  title: number | null;
  fname: string | null;
  lname: string | null;
  email: string | null;
  password: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
  process_location_group: number | null;
  status: number | null;
  reset_pin: string | null;
}

export class UserEmbassy extends Model<
  InferAttributes<UserEmbassy>,
  InferCreationAttributes<UserEmbassy>
> {
  declare id: CreationOptional<number>;
  declare country: number | null;
  declare title: number | null;
  declare fname: string | null;
  declare lname: string | null;
  declare email: string | null;
  declare password: string | null;
  declare phone: string | null;
  declare mobile: string | null;
  declare notes: string | null;
  declare process_location_group: number | null;
  declare status: number | null;
  declare reset_pin: string | null;
}

UserEmbassy.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    country: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country',
    },
    title: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'title',
    },
    fname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'fname',
    },
    lname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'lname',
    },
    email: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'email',
    },
    password: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'password',
    },
    phone: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'phone',
    },
    mobile: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'mobile',
    },
    notes: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'notes',
    },
    process_location_group: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'process_location_group',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    reset_pin: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'reset_pin',
    },
  },
  {
    sequelize,
    tableName: 'tbl_user_embassy',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default UserEmbassy;
