/**
 * `tbl_order_return_document_details` — InnoDB, latin1.
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
export interface OrderReturnDocumentDetailsAttributes {
  id: number;
  order_id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  contact_number: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country_id: number | null;
  postcode: string | null;
  returning_date: string | null;
  additional_comment: string | null;
  status: number | null;
}

export class OrderReturnDocumentDetails extends Model<
  InferAttributes<OrderReturnDocumentDetails>,
  InferCreationAttributes<OrderReturnDocumentDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare first_name: string | null;
  declare last_name: string | null;
  declare email: string | null;
  declare contact_number: string | null;
  declare company: string | null;
  declare address: string | null;
  declare city: string | null;
  declare state: string | null;
  declare country_id: number | null;
  declare postcode: string | null;
  declare returning_date: string | null;
  declare additional_comment: string | null;
  declare status: number | null;
}

OrderReturnDocumentDetails.init(
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
    first_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'first_name',
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
    contact_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_number',
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'company',
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'address',
    },
    city: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'city',
    },
    state: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'state',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    postcode: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'postcode',
    },
    returning_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'returning_date',
    },
    additional_comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'additional_comment',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_return_document_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderReturnDocumentDetails;
