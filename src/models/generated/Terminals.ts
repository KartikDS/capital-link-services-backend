/**
 * `tbl_terminals` — InnoDB, latin1.
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
export interface TerminalsAttributes {
  id: number;
  terminal_name: string | null;
  popular_terminal: number | null;
}

export class Terminals extends Model<
  InferAttributes<Terminals>,
  InferCreationAttributes<Terminals>
> {
  declare id: CreationOptional<number>;
  declare terminal_name: string | null;
  declare popular_terminal: number | null;
}

Terminals.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    terminal_name: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'terminal_name',
    },
    popular_terminal: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'popular_terminal',
    },
  },
  {
    sequelize,
    tableName: 'tbl_terminals',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Terminals;
