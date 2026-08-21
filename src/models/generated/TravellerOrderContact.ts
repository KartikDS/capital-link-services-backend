/**
 * `tbl_traveller_order_contact` — InnoDB, latin1.
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
export interface TravellerOrderContactAttributes {
  id: number;
  traveller_id: number;
  contact_type: number;
  fname: string;
  lname: string;
  dob: string;
  phone: string;
  email: string;
  created: string;
  updated: string;
}

export class TravellerOrderContact extends Model<
  InferAttributes<TravellerOrderContact>,
  InferCreationAttributes<TravellerOrderContact>
> {
  declare id: CreationOptional<number>;
  declare traveller_id: number;
  declare contact_type: number;
  declare fname: string;
  declare lname: string;
  declare dob: string;
  declare phone: string;
  declare email: string;
  declare created: string;
  declare updated: string;
}

TravellerOrderContact.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    traveller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'traveller_id',
    },
    contact_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'contact_type',
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
    tableName: 'tbl_traveller_order_contact',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default TravellerOrderContact;
