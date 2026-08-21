/**
 * `tbl_user_admin` — InnoDB, latin1.
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
export interface UserAdminAttributes {
  id: number;
  last_login: string | null;
  fname: string | null;
  lname: string | null;
  email: string | null;
  password: string | null;
  reset_pin: string | null;
  s_enabled: number | null;
  s_driver: number | null;
}

export class UserAdmin extends Model<
  InferAttributes<UserAdmin>,
  InferCreationAttributes<UserAdmin>
> {
  declare id: CreationOptional<number>;
  declare last_login: string | null;
  declare fname: string | null;
  declare lname: string | null;
  declare email: string | null;
  declare password: string | null;
  declare reset_pin: string | null;
  declare s_enabled: number | null;
  declare s_driver: number | null;
}

UserAdmin.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    last_login: {
      type: DataTypes.CHAR(20),
      allowNull: true,
      field: 'last_login',
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
    email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'email',
    },
    password: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'password',
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
    s_driver: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 's_driver',
    },
  },
  {
    sequelize,
    tableName: 'tbl_user_admin',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default UserAdmin;
