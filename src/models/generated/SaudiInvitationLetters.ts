/**
 * `tbl_saudi_invitation_letters` — InnoDB, latin1.
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
export interface SaudiInvitationLettersAttributes {
  id: number;
  order_id: number | null;
  parent_id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  file: string | null;
  passport_number: string | null;
  gender: string | null;
  nationality: number | null;
  issuing_location: string | null;
  destination: number | null;
  visa_type: number | null;
  region: string | null;
  entry_option: number | null;
  duration_of_stay: string | null;
  validity: string | null;
  occupation: string | null;
  sponsor_name: string | null;
  sponsor_id_number: string | null;
  sponsor_phone: string | null;
  sponsor_address: string | null;
  multi_apply_before_date: string | null;
  comment: string | null;
  invitation_file: string | null;
  status: number | null;
  created_at: string | null;
  modified_at: string | null;
}

export class SaudiInvitationLetters extends Model<
  InferAttributes<SaudiInvitationLetters>,
  InferCreationAttributes<SaudiInvitationLetters>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare parent_id: number | null;
  declare name: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare file: string | null;
  declare passport_number: string | null;
  declare gender: string | null;
  declare nationality: number | null;
  declare issuing_location: string | null;
  declare destination: number | null;
  declare visa_type: number | null;
  declare region: string | null;
  declare entry_option: number | null;
  declare duration_of_stay: string | null;
  declare validity: string | null;
  declare occupation: string | null;
  declare sponsor_name: string | null;
  declare sponsor_id_number: string | null;
  declare sponsor_phone: string | null;
  declare sponsor_address: string | null;
  declare multi_apply_before_date: string | null;
  declare comment: string | null;
  declare invitation_file: string | null;
  declare status: number | null;
  declare created_at: string | null;
  declare modified_at: string | null;
}

SaudiInvitationLetters.init(
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
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'parent_id',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'name',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'email',
    },
    phone: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'phone',
    },
    file: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'file',
    },
    passport_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'passport_number',
    },
    gender: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'gender',
    },
    nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality',
    },
    issuing_location: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'issuing_location',
    },
    destination: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'destination',
    },
    visa_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_type',
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'region',
    },
    entry_option: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'entry_option',
    },
    duration_of_stay: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'duration_of_stay',
    },
    validity: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'validity',
    },
    occupation: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'occupation',
    },
    sponsor_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sponsor_name',
    },
    sponsor_id_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sponsor_id_number',
    },
    sponsor_phone: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sponsor_phone',
    },
    sponsor_address: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'sponsor_address',
    },
    multi_apply_before_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'multi_apply_before_date',
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'comment',
    },
    invitation_file: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'invitation_file',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_at',
    },
    modified_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'modified_at',
    },
  },
  {
    sequelize,
    tableName: 'tbl_saudi_invitation_letters',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default SaudiInvitationLetters;
