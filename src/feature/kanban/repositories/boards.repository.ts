import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres/driver';
import * as schema from '@src/schema';
import { and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { count, desc } from 'drizzle-orm';
import { CreateBoardType } from '../schemas/board.schema';

@Injectable()
export class BoardsRepository {
  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {}

  async getBoards(userId: number) {
    return await this.db.query.kanban_board.findMany({
      where: (boards) => eq(boards.owner_id, userId),
      orderBy: (boards) => [desc(boards.createdAt)],
    });
  }

  async getBoardByIdAndOwnerId(boardId: number, ownerId: number) {
    return await this.db.query.kanban_board.findFirst({
      where: (boards) =>
        and(eq(boards.id, boardId), eq(boards.owner_id, ownerId)),
      with: { columns: true },
    });
  }

  async getOwnedBoardsCount(ownerId: number): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.kanban_board)
      .where(eq(schema.kanban_board.owner_id, ownerId));

    return result.count;
  }

  async createBoard(ownerId: number, board: CreateBoardType) {
    return await this.db
      .insert(schema.kanban_board)
      .values({ ...board, owner_id: ownerId })
      .returning();
  }
}
