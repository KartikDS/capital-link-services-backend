/**
 * `tbl_order_dl_checklist` — InnoDB, latin1.
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
export interface OrderDlChecklistAttributes {
  id: number;
  order_no: number | null;
  type: string | null;
  number: number | null;
  note: string | null;
  doc_file: string | null;
}

export class OrderDlChecklist extends Model<
  InferAttributes<OrderDlChecklist>,
  InferCreationAttributes<OrderDlChecklist>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare type: string | null;
  declare number: number | null;
  declare note: string | null;
  declare doc_file: string | null;
}

OrderDlChecklist.init(
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
    type: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'type',
    },
    number: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'number',
    },
    note: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'note',
    },
    doc_file: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'doc_file',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_dl_checklist',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderDlChecklist;
