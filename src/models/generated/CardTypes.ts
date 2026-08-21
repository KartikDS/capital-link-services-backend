/**
 * `tbl_card_types` — InnoDB, latin1.
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
export interface CardTypesAttributes {
  id: number;
  name: string | null;
}

export class CardTypes extends Model<
  InferAttributes<CardTypes>,
  InferCreationAttributes<CardTypes>
> {
  declare id: CreationOptional<number>;
  declare name: string | null;
}

CardTypes.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    name: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'name',
    },
  },
  {
    sequelize,
    tableName: 'tbl_card_types',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default CardTypes;
