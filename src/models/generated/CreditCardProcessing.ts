/**
 * `tbl_credit_card_processing` — InnoDB, latin1.
 *
 * Generated from db/schema/clspubli_staging.sql by scripts/generateModels.ts.
 * Do not edit: re-run `npm run models:generate` if CLS supplies a new dump.
 */
import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../config/database';

/** Every column, as it is read back. Use this in presenters. */
export interface CreditCardProcessingAttributes {
  id: number;
  fee: number | null;
}

export class CreditCardProcessing extends Model<
  InferAttributes<CreditCardProcessing>,
  InferCreationAttributes<CreditCardProcessing>
> {
  declare id: number;
  declare fee: number | null;
}

CreditCardProcessing.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'id',
    },
    fee: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'fee',
    },
  },
  {
    sequelize,
    tableName: 'tbl_credit_card_processing',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default CreditCardProcessing;
