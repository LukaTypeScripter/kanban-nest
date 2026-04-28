import { BoardsRepository } from '@feature/kanban/repositories/boards.repository';
import { TestDb, startTestDb, truncateAll } from './setup';
import { CreateBoardType } from '@feature/kanban/schemas/board.schema';
import * as schema from '@src/schema';
import { CreateColumnType } from '@feature/kanban/schemas/column.schema';
import { CreateCardType } from '@feature/kanban/schemas/card.schema';

describe('BoardsRepository (integration)', () => {
  let testDb: TestDb;
  let repo: BoardsRepository;
  let ownerId: number;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = new BoardsRepository(testDb.db);
  }, 120_000);

  afterAll(async () => {
    await testDb.shutdown();
  });

  beforeEach(async () => {
    await truncateAll(testDb.db);
    const [user] = await testDb.db
      .insert(schema.users)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        emailVerified: false,
      })
      .returning({ id: schema.users.id });
    ownerId = user.id;
  });

  const dummyBoard: CreateBoardType = {
    title: 'Test Board',
    description: 'hello',
    color: 'amber',
  };

  const dummyColumn: CreateColumnType = {
    title: 'Test Column',
    position: 0,
  };

  const dummyCard: CreateCardType = {
    title: 'Test Card',
    description: 'hello',
    position: 0,
  };

  const limit = 10;

  describe('boards', () => {
    it('should return boards belonging to the owner', async () => {
      await repo.createBoardWithLimit(
        ownerId,
        { ...dummyBoard, title: 'created for get boards' },
        limit,
      );

      const boards = await repo.getBoards(ownerId);
      expect(boards).toHaveLength(1);
      expect(boards[0].title).toBe('created for get boards');
      expect(boards[0].owner_id).toBe(ownerId);
    });

    it('should get a board by id and owner id', async () => {
      const board = await repo.createBoardWithLimit(
        ownerId,
        { ...dummyBoard, title: 'created for get by id' },
        limit,
      );
      if (!board) return;

      const found = await repo.getBoardByIdAndOwnerId(board.id, ownerId);
      if (!found) return;

      expect(found.id).toBe(board.id);
    });

    it('should create a new board', async () => {
      const board = await repo.createBoardWithLimit(
        ownerId,
        { ...dummyBoard, title: 'created' },
        limit,
      );
      expect(board).not.toBeNull();
    });

    it('should return null when board limit is reached', async () => {
      for (let i = 0; i < limit; i++) {
        await repo.createBoardWithLimit(
          ownerId,
          { ...dummyBoard, title: `Board ${i}` },
          limit,
        );
      }
      const board = await repo.createBoardWithLimit(
        ownerId,
        { ...dummyBoard, title: 'Over Limit' },
        limit,
      );
      expect(board).toBeNull();
    });

    it('should update a board', async () => {
      const board = await repo.createBoardWithLimit(
        ownerId,
        { ...dummyBoard, title: 'created for update' },
        limit,
      );
      if (!board) return;

      const updated = await repo.updateBoard(ownerId, board.id, {
        title: 'updated',
      });

      expect(updated.title).toBe('updated');
    });

    it('should delete a board', async () => {
      const board = await repo.createBoardWithLimit(
        ownerId,
        { ...dummyBoard, title: 'created for delete' },
        limit,
      );
      if (!board) return;

      const deleted = await repo.deleteBoard(ownerId, board.id);
      expect(deleted).not.toBeNull();
    });
  });

  describe('columns', () => {
    it('should create a column', async () => {
      const board = await repo.createBoardWithLimit(ownerId, dummyBoard, limit);
      if (!board) return;

      const column = await repo.createColumnWithLimit(
        board.id,
        dummyColumn,
        limit,
      );
      expect(column).not.toBeNull();
    });

    it('should return null when column limit is reached', async () => {
      const board = await repo.createBoardWithLimit(
        ownerId,
        { ...dummyBoard, title: 'created for limit' },
        limit,
      );
      if (!board) return;

      for (let i = 0; i < limit; i++) {
        await repo.createColumnWithLimit(
          board.id,
          { ...dummyColumn, title: `Column ${i}` },
          limit,
        );
      }

      const column = await repo.createColumnWithLimit(
        board.id,
        { ...dummyColumn, title: 'Over Limit' },
        limit,
      );
      expect(column).toBeNull();
    });

    it('should update a column', async () => {
      const board = await repo.createBoardWithLimit(ownerId, dummyBoard, limit);
      if (!board) return;

      const column = await repo.createColumnWithLimit(
        board.id,
        dummyColumn,
        limit,
      );
      if (!column) return;

      const updated = await repo.updateColumn(board.id, column.id, {
        title: 'updated',
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('updated');
    });

    it('should delete a column', async () => {
      const board = await repo.createBoardWithLimit(ownerId, dummyBoard, limit);
      if (!board) return;

      const column = await repo.createColumnWithLimit(
        board.id,
        dummyColumn,
        limit,
      );
      if (!column) return;

      const deleted = await repo.deleteColumn(board.id, column.id);
      expect(deleted).toBe(true);
    });
  });

  describe('cards', () => {
    let columnId: number;

    beforeEach(async () => {
      const board = await repo.createBoardWithLimit(ownerId, dummyBoard, limit);
      if (!board) throw new Error('board setup failed');

      const column = await repo.createColumnWithLimit(
        board.id,
        dummyColumn,
        limit,
      );
      if (!column) throw new Error('column setup failed');
      columnId = column.id;
    });

    it('should create a card', async () => {
      const card = await repo.createCardWithLimit(columnId, dummyCard, limit);
      expect(card).not.toBeNull();
    });

    it('should update a card', async () => {
      const card = await repo.createCardWithLimit(columnId, dummyCard, limit);
      if (!card) return;

      const updated = await repo.updateCard(columnId, card.id, {
        title: 'updated',
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('updated');
    });

    it('should delete a card', async () => {
      const card = await repo.createCardWithLimit(columnId, dummyCard, limit);
      if (!card) return;

      const deleted = await repo.deleteCard(columnId, card.id);
      expect(deleted).toBe(true);
    });
  });

  describe('moveCard', () => {
    let sourceColumnId: number;
    let targetColumnId: number;

    beforeEach(async () => {
      const board = await repo.createBoardWithLimit(ownerId, dummyBoard, limit);
      if (!board) throw new Error('board setup failed');

      const sourceColumn = await repo.createColumnWithLimit(
        board.id,
        { ...dummyColumn, title: 'source', position: 0 },
        limit,
      );
      if (!sourceColumn) throw new Error('source column setup failed');
      sourceColumnId = sourceColumn.id;

      const targetColumn = await repo.createColumnWithLimit(
        board.id,
        { ...dummyColumn, title: 'target', position: 1 },
        limit,
      );
      if (!targetColumn) throw new Error('target column setup failed');
      targetColumnId = targetColumn.id;
    });

    it('should move a card to another column with the requested position', async () => {
      const card = await repo.createCardWithLimit(
        sourceColumnId,
        {
          ...dummyCard,
          title: 'move me',
          position: 1000,
        },
        limit,
      );
      if (!card) throw new Error('card setup failed');

      const moved = await repo.moveCard(card.id, targetColumnId, 2000);

      expect(moved).not.toBeNull();
      expect(moved?.column_id).toBe(targetColumnId);
      expect(moved?.position).toBe(2000);

      const sourceCards = await repo.getCardsInColumn(sourceColumnId);
      const targetCards = await repo.getCardsInColumn(targetColumnId);
      expect(sourceCards).toEqual([]);
      expect(targetCards.map((c) => c.id)).toEqual([card.id]);
    });

    it('should return null when the card does not exist', async () => {
      const moved = await repo.moveCard(99999, targetColumnId, 1000);
      expect(moved).toBeNull();
    });

    it('should roll back a move when the surrounding transaction throws', async () => {
      const card = await repo.createCardWithLimit(
        sourceColumnId,
        {
          ...dummyCard,
          title: 'rollback',
          position: 1000,
        },
        limit,
      );
      if (!card) throw new Error('card setup failed');

      await expect(
        repo.transaction.runInTransaction(async (tx) => {
          await repo.moveCard(card.id, targetColumnId, 2000, tx);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const sourceCards = await repo.getCardsInColumn(sourceColumnId);
      const targetCards = await repo.getCardsInColumn(targetColumnId);
      expect(sourceCards.map((c) => c.id)).toEqual([card.id]);
      expect(sourceCards[0].position).toBe(1000);
      expect(targetCards).toEqual([]);
    });
  });

  describe('normalizeColumnPositions', () => {
    let boardId: number;
    let columnId: number;

    beforeEach(async () => {
      const board = await repo.createBoardWithLimit(ownerId, dummyBoard, limit);
      if (!board) throw new Error('board setup failed');
      boardId = board.id;

      const column = await repo.createColumnWithLimit(
        board.id,
        dummyColumn,
        limit,
      );
      if (!column) throw new Error('column setup failed');
      columnId = column.id;
    });

    it('should be a no-op when the column has no cards', async () => {
      await expect(
        repo.normalizeColumnPositions(columnId),
      ).resolves.toBeUndefined();

      const cards = await repo.getCardsInColumn(columnId);
      expect(cards).toEqual([]);
    });

    it('should renumber cards to 1000, 2000, 3000 in ascending position order', async () => {
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'A', position: 42 },
        limit,
      );
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'B', position: 1500 },
        limit,
      );
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'C', position: 9999 },
        limit,
      );

      await repo.normalizeColumnPositions(columnId);

      const cards = await repo.getCardsInColumn(columnId);
      expect(
        cards.map((c) => ({ title: c.title, position: c.position })),
      ).toEqual([
        { title: 'A', position: 1000 },
        { title: 'B', position: 2000 },
        { title: 'C', position: 3000 },
      ]);
    });

    it('should preserve relative order even when input positions are not multiples of 1000', async () => {
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'first', position: 1 },
        limit,
      );
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'second', position: 2 },
        limit,
      );

      await repo.normalizeColumnPositions(columnId);

      const cards = await repo.getCardsInColumn(columnId);
      expect(cards.map((c) => c.title)).toEqual(['first', 'second']);
      expect(cards.map((c) => c.position)).toEqual([1000, 2000]);
    });

    it('should not affect cards in other columns', async () => {
      const otherColumn = await repo.createColumnWithLimit(
        boardId,
        { ...dummyColumn, title: 'other', position: 1 },
        limit,
      );
      if (!otherColumn) throw new Error('other column setup failed');

      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'target', position: 50 },
        limit,
      );
      const untouched = await repo.createCardWithLimit(
        otherColumn.id,
        { ...dummyCard, title: 'untouched', position: 7 },
        limit,
      );
      if (!untouched) throw new Error('untouched card setup failed');

      await repo.normalizeColumnPositions(columnId);

      const otherCards = await repo.getCardsInColumn(otherColumn.id);
      expect(otherCards).toHaveLength(1);
      expect(otherCards[0].id).toBe(untouched.id);
      expect(otherCards[0].position).toBe(7);
    });

    it('should participate in a caller-supplied transaction', async () => {
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'X', position: 11 },
        limit,
      );
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'Y', position: 22 },
        limit,
      );

      await repo.transaction.runInTransaction(async (tx) => {
        await repo.normalizeColumnPositions(columnId, tx);
      });

      const cards = await repo.getCardsInColumn(columnId);
      expect(cards.map((c) => c.position)).toEqual([1000, 2000]);
    });

    it('should roll back position changes when the surrounding transaction throws', async () => {
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'keep', position: 11 },
        limit,
      );
      await repo.createCardWithLimit(
        columnId,
        { ...dummyCard, title: 'keep2', position: 22 },
        limit,
      );

      await expect(
        repo.transaction.runInTransaction(async (tx) => {
          await repo.normalizeColumnPositions(columnId, tx);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const cards = await repo.getCardsInColumn(columnId);
      expect(cards.map((c) => c.position)).toEqual([11, 22]);
    });
  });
});
