/**
 * `tbl_suggestions` — InnoDB, latin1.
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
export interface SuggestionsAttributes {
  id: number;
  suggestion_field: string | null;
  info: string | null;
  status: number | null;
  created: string | null;
  modified: string | null;
}

export class Suggestions extends Model<
  InferAttributes<Suggestions>,
  InferCreationAttributes<Suggestions>
> {
  declare id: CreationOptional<number>;
  declare suggestion_field: string | null;
  declare info: string | null;
  declare status: number | null;
  declare created: string | null;
  declare modified: string | null;
}

Suggestions.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    suggestion_field: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'suggestion_field',
    },
    info: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'info',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created',
    },
    modified: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'modified',
    },
  },
  {
    sequelize,
    tableName: 'tbl_suggestions',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Suggestions;
