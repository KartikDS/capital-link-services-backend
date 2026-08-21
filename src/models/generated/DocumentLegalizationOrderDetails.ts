/**
 * `tbl_document_legalization_order_details` — InnoDB, latin1.
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
export interface DocumentLegalizationOrderDetailsAttributes {
  id: number;
  order_id: number | null;
  destination: number | null;
  nationality: number | null;
  type_of_document: number | null;
  ref_no: string | null;
  com_invoice_no: string | null;
  date_cls_received_all_items: string | null;
  date_submitted_for_processing: string | null;
  date_completed_and_received_at_cls: string | null;
  date_order_on_route_and_closed: string | null;
  status: number;
}

export class DocumentLegalizationOrderDetails extends Model<
  InferAttributes<DocumentLegalizationOrderDetails>,
  InferCreationAttributes<DocumentLegalizationOrderDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare destination: number | null;
  declare nationality: number | null;
  declare type_of_document: number | null;
  declare ref_no: string | null;
  declare com_invoice_no: string | null;
  declare date_cls_received_all_items: string | null;
  declare date_submitted_for_processing: string | null;
  declare date_completed_and_received_at_cls: string | null;
  declare date_order_on_route_and_closed: string | null;
  declare status: CreationOptional<number>;
}

DocumentLegalizationOrderDetails.init(
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
    destination: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'destination',
    },
    nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality',
    },
    type_of_document: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'type_of_document',
    },
    ref_no: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'ref_no',
    },
    com_invoice_no: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'com_invoice_no',
    },
    date_cls_received_all_items: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_cls_received_all_items',
    },
    date_submitted_for_processing: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_submitted_for_processing',
    },
    date_completed_and_received_at_cls: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_completed_and_received_at_cls',
    },
    date_order_on_route_and_closed: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_order_on_route_and_closed',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_document_legalization_order_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default DocumentLegalizationOrderDetails;
