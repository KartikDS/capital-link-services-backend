/**
 * `tbl_tpn_notes` — MyISAM, latin1.
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
export interface TpnNotesAttributes {
  id: number;
  tpn_no: string | null;
  note: string | null;
  date_added: string | null;
  note_by: number | null;
  user_type: string | null;
}

export class TpnNotes extends Model<
  InferAttributes<TpnNotes>,
  InferCreationAttributes<TpnNotes>
> {
  declare id: CreationOptional<number>;
  declare tpn_no: string | null;
  declare note: string | null;
  declare date_added: string | null;
  declare note_by: number | null;
  declare user_type: string | null;
}

TpnNotes.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    tpn_no: {
      type: DataTypes.CHAR(15),
      allowNull: true,
      field: 'tpn_no',
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
    user_type: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'user_type',
    },
  },
  {
    sequelize,
    tableName: 'tbl_tpn_notes',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default TpnNotes;
