/**
 * `tbl_order_destination_notes` — MyISAM, latin1.
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
export interface OrderDestinationNotesAttributes {
  id: number;
  destination_id: number | null;
  note: string | null;
  date_added: string | null;
  note_by: number | null;
  note_by_name: string | null;
  user_type: string | null;
  is_pin: number | null;
  is_admin: number | null;
  attachment: string | null;
}

export class OrderDestinationNotes extends Model<
  InferAttributes<OrderDestinationNotes>,
  InferCreationAttributes<OrderDestinationNotes>
> {
  declare id: CreationOptional<number>;
  declare destination_id: number | null;
  declare note: string | null;
  declare date_added: string | null;
  declare note_by: number | null;
  declare note_by_name: string | null;
  declare user_type: string | null;
  declare is_pin: number | null;
  declare is_admin: number | null;
  declare attachment: string | null;
}

OrderDestinationNotes.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    destination_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'destination_id',
    },
    note: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'note',
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
    is_pin: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'is_pin',
    },
    is_admin: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'is_admin',
    },
    attachment: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'attachment',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_destination_notes',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderDestinationNotes;
