/**
 * `tbl_traveller_information` — InnoDB, latin1.
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
export interface TravellerInformationAttributes {
  id: number;
  parent_id: number | null;
  deliver_visa_time: string;
  entry_date: string;
  exit_date: string;
  is_fast_track: number;
  no_of_traveller: number;
  fname: string;
  lname: string;
  password: string;
  dob: string;
  phone: string;
  email: string;
  has_passport_type: number;
  passport_number: string;
  passport_expiration_date: string;
  created: string;
  updated: string;
}

export class TravellerInformation extends Model<
  InferAttributes<TravellerInformation>,
  InferCreationAttributes<TravellerInformation>
> {
  declare id: CreationOptional<number>;
  declare parent_id: number | null;
  declare deliver_visa_time: string;
  declare entry_date: string;
  declare exit_date: string;
  declare is_fast_track: number;
  declare no_of_traveller: number;
  declare fname: string;
  declare lname: string;
  declare password: string;
  declare dob: string;
  declare phone: string;
  declare email: string;
  declare has_passport_type: number;
  declare passport_number: string;
  declare passport_expiration_date: string;
  declare created: string;
  declare updated: string;
}

TravellerInformation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent_id',
    },
    deliver_visa_time: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'deliver_visa_time',
    },
    entry_date: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'entry_date',
    },
    exit_date: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'exit_date',
    },
    is_fast_track: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'is_fast_track',
    },
    no_of_traveller: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'no_of_traveller',
    },
    fname: {
      type: DataTypes.STRING(225),
      allowNull: false,
      field: 'fname',
    },
    lname: {
      type: DataTypes.STRING(225),
      allowNull: false,
      field: 'lname',
    },
    password: {
      type: DataTypes.STRING(225),
      allowNull: false,
      field: 'password',
    },
    dob: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'dob',
    },
    phone: {
      type: DataTypes.STRING(225),
      allowNull: false,
      field: 'phone',
    },
    email: {
      type: DataTypes.STRING(225),
      allowNull: false,
      field: 'email',
    },
    has_passport_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'has_passport_type',
    },
    passport_number: {
      type: DataTypes.STRING(225),
      allowNull: false,
      field: 'passport_number',
    },
    passport_expiration_date: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'passport_expiration_date',
    },
    created: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created',
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated',
    },
  },
  {
    sequelize,
    tableName: 'tbl_traveller_information',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default TravellerInformation;
