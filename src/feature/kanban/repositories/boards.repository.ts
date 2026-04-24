import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres/driver';
import * as schema from '@src/schema';
import { and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { desc } from 'drizzle-orm';
import { CreateBoardType, UpdateBoardType } from '../schemas/board.schema';
import { RunInTransactionUtility } from '@common/utility/run-in-transaction.utility';
import { Tx } from '@common/types/transaction.type';
import { CreateColumnType, UpdateColumnType } from '../schemas/column.schema';
import { BoardColumnPayloadType } from '../schemas/board-column-payload.schema';
import { Board } from '../schemas/board.schema';
import { KanbanBoardWithColumns } from '../schemas/kanban-column.schema';
import {
  CardType,
  CreateCardType,
  UpdateCardType,
} from '../schemas/card.schema';

@Injectable()
export class BoardsRepository {
  transaction: RunInTransactionUtility;

  constructor(
    @Inject(DrizzleAsyncProvider) private db: NodePgDatabase<typeof schema>,
  ) {
    this.transaction = new RunInTransactionUtility(db);
  }
  async getBoards(userId: number): Promise<Board[]> {
    return await this.db.query.kanban_board.findMany({
      where: (boards) => eq(boards.owner_id, userId),
      orderBy: (boards) => [desc(boards.createdAt)],
    });
  }

  async getBoardByIdAndOwnerId(
    boardId: number,
    ownerId: number,
  ): Promise<KanbanBoardWithColumns | undefined> {
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
  ): Promise<Board | null> {
    return await this.transaction.runInTransaction(async (tx) => {
      const rows = await tx
        .select({ id: schema.kanban_board.id })
        .from(schema.kanban_board)
        .where(eq(schema.kanban_board.owner_id, ownerId))
        .for('update');

      if (rows.length >= limit) return null;

      const [created] = await tx
        .insert(schema.kanban_board)
        .values({ ...board, owner_id: ownerId })
        .returning();
      return created ?? null;
    });
  }

  async createBoard(
    ownerId: number,
    board: CreateBoardType,
    tx?: Tx,
  ): Promise<Board[]> {
    return await (tx || this.db)
      .insert(schema.kanban_board)
      .values({ ...board, owner_id: ownerId })
      .returning();
  }

  async updateBoard(
    ownerId: number,
    boardId: number,
    updateData: UpdateBoardType,
  ): Promise<Board> {
    const [updated] = await this.db
      .update(schema.kanban_board)
      .set(updateData)
      .where(
        and(
          eq(schema.kanban_board.id, boardId),
          eq(schema.kanban_board.owner_id, ownerId),
        ),
      )
      .returning();

    return updated;
  }

  async deleteBoard(ownerId: number, boardId: number): Promise<Board | null> {
    const [deleted] = await this.db
      .delete(schema.kanban_board)
      .where(
        and(
          eq(schema.kanban_board.id, boardId),
          eq(schema.kanban_board.owner_id, ownerId),
        ),
      )
      .returning();

    return deleted ?? null;
  }

  // columns
  async createColumnWithLimit(
    boardId: number,
    column: CreateColumnType,
    limit: number,
  ): Promise<BoardColumnPayloadType | null> {
    return await this.transaction.runInTransaction(async (tx) => {
      const rows = await tx
        .select({ id: schema.kanban_column.id })
        .from(schema.kanban_column)
        .where(eq(schema.kanban_column.board_id, boardId))
        .for('update');

      if (rows.length >= limit) return null;

      const [created] = await tx
        .insert(schema.kanban_column)
        .values({ ...column, board_id: boardId })
        .returning();
      return created ?? null;
    });
  }

  async updateColumn(
    boardId: number,
    columnId: number,
    updateData: UpdateColumnType,
  ): Promise<BoardColumnPayloadType | null> {
    const [updated] = await this.db
      .update(schema.kanban_column)
      .set(updateData)
      .where(
        and(
          eq(schema.kanban_column.id, columnId),
          eq(schema.kanban_column.board_id, boardId),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async deleteColumn(boardId: number, columnId: number): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.kanban_column)
      .where(
        and(
          eq(schema.kanban_column.id, columnId),
          eq(schema.kanban_column.board_id, boardId),
        ),
      )
      .returning();
    return deleted ? true : false;
  }

  // cards
  async createCardWithLimit(
    columnId: number,
    card: CreateCardType,
    limit: number,
  ): Promise<CardType | null> {
    return await this.transaction.runInTransaction(async (tx) => {
      const rows = await tx
        .select({ id: schema.kanban_card.id })
        .from(schema.kanban_card)
        .where(eq(schema.kanban_card.column_id, columnId))
        .for('update');

      if (rows.length >= limit) return null;

      const [created] = await tx
        .insert(schema.kanban_card)
        .values({ ...card, column_id: columnId })
        .returning();
      return created ?? null;
    });
  }

  async updateCard(
    columnId: number,
    cardId: number,
    updateData: UpdateCardType,
  ): Promise<CardType | null> {
    const [updated] = await this.db
      .update(schema.kanban_card)
      .set(updateData)
      .where(
        and(
          eq(schema.kanban_card.id, cardId),
          eq(schema.kanban_card.column_id, columnId),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async deleteCard(columnId: number, cardId: number): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.kanban_card)
      .where(
        and(
          eq(schema.kanban_card.id, cardId),
          eq(schema.kanban_card.column_id, columnId),
        ),
      )
      .returning();
    return !!deleted;
  }
}
