/**
 * `tbl_cls_calendar_event` — InnoDB, latin1.
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
export interface ClsCalendarEventAttributes {
  id: number;
  title: string;
  start_date: string;
  value: string;
  order_no: string | null;
  due_date: string;
  invitees: string;
  notes: string | null;
  attachment: string | null;
  status: number;
  created_at: string | null;
  updated_at: string | null;
}

export class ClsCalendarEvent extends Model<
  InferAttributes<ClsCalendarEvent>,
  InferCreationAttributes<ClsCalendarEvent>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare start_date: string;
  declare value: string;
  declare order_no: string | null;
  declare due_date: string;
  declare invitees: string;
  declare notes: string | null;
  declare attachment: string | null;
  declare status: CreationOptional<number>;
  declare created_at: string | null;
  declare updated_at: string | null;
}

ClsCalendarEvent.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'title',
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'start_date',
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'value',
    },
    order_no: {
      type: DataTypes.STRING(25),
      allowNull: true,
      field: 'order_no',
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'due_date',
    },
    invitees: {
      type: DataTypes.STRING(250),
      allowNull: false,
      field: 'invitees',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notes',
    },
    attachment: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'attachment',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'status',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'tbl_cls_calendar_event',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ClsCalendarEvent;
