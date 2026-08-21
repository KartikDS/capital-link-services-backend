/**
 * `tbl_order_notes` — MyISAM, latin1.
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
export interface OrderNotesAttributes {
  id: number;
  order_no: number | null;
  note: string | null;
  document_type: string | null;
  location: string | null;
  price: number | null;
  status: string | null;
  date_added: string | null;
  note_by: number | null;
  note_by_name: string | null;
  user_type: string | null;
  is_admin: number | null;
  is_deleted: number;
}

export class OrderNotes extends Model<
  InferAttributes<OrderNotes>,
  InferCreationAttributes<OrderNotes>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare note: string | null;
  declare document_type: string | null;
  declare location: string | null;
  declare price: number | null;
  declare status: string | null;
  declare date_added: string | null;
  declare note_by: number | null;
  declare note_by_name: string | null;
  declare user_type: string | null;
  declare is_admin: number | null;
  declare is_deleted: CreationOptional<number>;
}

OrderNotes.init(
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
    note: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'note',
    },
    document_type: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'document_type',
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'location',
    },
    price: {
      type: DataTypes.FLOAT(10,2),
      allowNull: true,
      defaultValue: 0,
      field: 'price',
    },
    status: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'status',
    },
    date_added: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_added',
    },
    note_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'note_by',
    },
    note_by_name: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'note_by_name',
    },
    user_type: {
      type: DataTypes.CHAR(20),
      allowNull: true,
      field: 'user_type',
    },
    is_admin: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'is_admin',
    },
    is_deleted: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'is_deleted',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_notes',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderNotes;
