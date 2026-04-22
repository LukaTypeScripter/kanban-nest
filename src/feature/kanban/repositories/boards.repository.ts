import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres/driver';
import * as schema from '@src/schema';
import { and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { count, desc } from 'drizzle-orm';
import { CreateBoardType } from '../schemas/board.schema';
import { RunInTransactionUtility } from '@common/utility/run-in-transaction.utility';
import { Tx } from '@common/types/transaction.type';

@Injectable()
export class BoardsRepository {
  transaction: RunInTransactionUtility;

  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {
    this.transaction = new RunInTransactionUtility(db);
  }
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

  async createBoardWithLimit(
    ownerId: number,
    board: CreateBoardType,
    limit: number,
  ) {
    return await this.transaction.runInTransaction(async (tx) => {
      const [result] = await tx
        .select({ count: count() })
        .from(schema.kanban_board)
        .where(eq(schema.kanban_board.owner_id, ownerId))
        .for('update');

      if (result.count >= limit) return null;

      const [created] = await tx
        .insert(schema.kanban_board)
        .values({ ...board, owner_id: ownerId })
        .returning();
      return created ?? null;
    });
  }

  async createBoard(ownerId: number, board: CreateBoardType, tx?: Tx) {
    return await (tx || this.db)
      .insert(schema.kanban_board)
      .values({ ...board, owner_id: ownerId })
      .returning();
  }
}
