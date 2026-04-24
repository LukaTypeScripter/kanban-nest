import { InferSelectModel } from 'drizzle-orm';
import * as schema from '@src/schema';

export type KanbanBoardWithColumns = InferSelectModel<
  typeof schema.kanban_board
> & {
  columns: InferSelectModel<typeof schema.kanban_column>[];
};
