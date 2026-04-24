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
});
