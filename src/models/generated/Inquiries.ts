/**
 * `tbl_inquiries` — InnoDB, latin1.
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
export interface InquiriesAttributes {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  query: string;
  status: string;
  created: string | null;
  updated: string | null;
}

export class Inquiries extends Model<
  InferAttributes<Inquiries>,
  InferCreationAttributes<Inquiries>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare email: string;
  declare phone: string;
  declare subject: string;
  declare query: string;
  declare status: string;
  declare created: string | null;
  declare updated: string | null;
}

Inquiries.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'name',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'email',
    },
    phone: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'phone',
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'subject',
    },
    query: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'query',
    },
    status: {
      type: DataTypes.CHAR(100),
      allowNull: false,
      field: 'status',
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created',
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated',
    },
  },
  {
    sequelize,
    tableName: 'tbl_inquiries',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Inquiries;
