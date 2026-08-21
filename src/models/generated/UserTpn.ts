/**
 * `tbl_user_tpn` — InnoDB, latin1.
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
export interface UserTpnAttributes {
  id: number;
  date_last_login: string | null;
  fname: string | null;
  lname: string | null;
  email: string | null;
  phone: string | null;
  password: string | null;
  reset_pin: string | null;
  /** 1=enabled; 0 = disabled */
  s_enabled: number | null;
}

export class UserTpn extends Model<
  InferAttributes<UserTpn>,
  InferCreationAttributes<UserTpn>
> {
  declare id: CreationOptional<number>;
  declare date_last_login: string | null;
  declare fname: string | null;
  declare lname: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare password: string | null;
  declare reset_pin: string | null;
  declare s_enabled: number | null;
}

UserTpn.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    date_last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_last_login',
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
    phone: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'phone',
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
  },
  {
    sequelize,
    tableName: 'tbl_user_tpn',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default UserTpn;
