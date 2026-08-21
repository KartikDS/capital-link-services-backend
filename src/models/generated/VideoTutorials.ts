/**
 * `tbl_video_tutorials` — InnoDB, latin1.
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
export interface VideoTutorialsAttributes {
  id: number;
  title: string | null;
  video: string | null;
  type: string | null;
}

export class VideoTutorials extends Model<
  InferAttributes<VideoTutorials>,
  InferCreationAttributes<VideoTutorials>
> {
  declare id: CreationOptional<number>;
  declare title: string | null;
  declare video: string | null;
  declare type: string | null;
}

VideoTutorials.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    title: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'title',
    },
    video: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'video',
    },
    type: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'type',
    },
  },
  {
    sequelize,
    tableName: 'tbl_video_tutorials',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default VideoTutorials;
