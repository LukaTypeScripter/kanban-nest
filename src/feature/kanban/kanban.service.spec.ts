import { Test, TestingModule } from '@nestjs/testing';
import { KanbanService } from './kanban.service';
import { BoardsRepository } from './repositories/boards.repository';
import { ForbiddenException } from '@nestjs/common';
import { KanbanConflictException, KanbanException } from './kanban.exception';

type BoardRepoMock = jest.Mocked<
  Pick<
    BoardsRepository,
    | 'getBoards'
    | 'getBoardByIdAndOwnerId'
    | 'createBoardWithLimit'
    | 'updateColumn'
    | 'deleteColumn'
    | 'createColumnWithLimit'
    | 'createCardWithLimit'
    | 'updateCard'
    | 'deleteCard'
    | 'normalizeColumnPositions'
    | 'getColumnById'
    | 'getCardById'
    | 'moveCard'
    | 'getCardsInColumn'
  >
> & { transaction: { runInTransaction: jest.Mock } };

describe('KanbanService', () => {
  let service: KanbanService;

  const boardsRepo = {
    getBoards: jest.fn(),
    getBoardByIdAndOwnerId: jest.fn(),
    createBoardWithLimit: jest.fn(),
    updateColumn: jest.fn(),
    deleteColumn: jest.fn(),
    createColumnWithLimit: jest.fn(),
    createCardWithLimit: jest.fn(),
    updateCard: jest.fn(),
    deleteCard: jest.fn(),
    normalizeColumnPositions: jest.fn(),
    getColumnById: jest.fn(),
    getCardById: jest.fn(),
    moveCard: jest.fn(),
    getCardsInColumn: jest.fn(),
    transaction: {
      runInTransaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb({})),
    },
  } as BoardRepoMock;

  const userId = 1;
  const boardId = 1;
  const columnId = 1;
  const cardId = 1;

  const makeCard = (id: number, position: number) => ({
    id,
    column_id: columnId,
    title: `Card ${id}`,
    description: null,
    position,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  });

  const cardA = makeCard(1, 1000);
  const cardB = makeCard(2, 2000);
  const cardC = makeCard(3, 3000);
  const cardD = makeCard(4, 4000);

  const board = {
    id: 1,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    description: 'A new board',
    owner_id: 1,
    title: 'New Board',
    color: null,
    columns: [],
  };

  const column = {
    id: columnId,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    title: 'New Column',
    position: 1,
    board_id: boardId,
  };

  const updatedCard = {
    id: cardId,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    title: 'Updated Card',
    position: 2,
    description: 'Updated Description',
    column_id: columnId,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KanbanService,
        {
          provide: BoardsRepository,
          useValue: boardsRepo,
        },
      ],
    }).compile();

    service = module.get<KanbanService>(KanbanService);

    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    boardsRepo.getColumnById.mockResolvedValue(column);
    boardsRepo.getCardsInColumn.mockResolvedValue([cardA, cardB, cardC, cardD]);
    boardsRepo.normalizeColumnPositions.mockResolvedValue(undefined);
    boardsRepo.moveCard.mockResolvedValue({ ...cardA, position: 3500 });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleNormalError', () => {
    it('rethrows ForbiddenException as-is', () => {
      const err = new ForbiddenException('no access');
      expect(() => service.handleNormalError(err)).toThrow(err);
    });

    it('rethrows a generic Error', () => {
      const err = new Error('something went wrong');
      expect(() => service.handleNormalError(err)).toThrow(err);
    });

    it('rethrows a non-Error value', () => {
      expect(() => service.handleNormalError('oops')).toThrow('oops');
    });
  });

  describe('handleDuplicationTitleError', () => {
    it('rethrows ForbiddenException as-is', () => {
      const err = new ForbiddenException('no access');
      expect(() => service.handleDuplicationTitleError(err)).toThrow(err);
    });

    it('throws KanbanConflictException with DuplicateBoardTitle on postgres 23505', () => {
      const err = Object.assign(new Error('duplicate'), { code: '23505' });
      expect(() => service.handleDuplicationTitleError(err)).toThrow(
        KanbanConflictException,
      );
    });

    it('rethrows a non-Error value', () => {
      expect(() => service.handleDuplicationTitleError('oops')).toThrow('oops');
    });
  });

  describe('pickPosition', () => {
    it('should pick position between two existing positions', () => {
      const prevPosition = 1000;
      const nextPosition = 2000;
      const result = service.pickPosition(prevPosition, nextPosition);
      expect(result).toBe(1500);
    });

    it('should pick position before the first existing position', () => {
      const prevPosition = null;
      const nextPosition = 1000;
      const result = service.pickPosition(prevPosition, nextPosition);
      expect(result).toBe(500);
    });

    it('should pick position after the last existing position', () => {
      const prevPosition = 2000;
      const nextPosition = null;
      const result = service.pickPosition(prevPosition, nextPosition);
      expect(result).toBe(3000);
    });
  });

  describe('moveCard', () => {
    const toColumnId = columnId;

    it('moves a card between two neighboring positions', async () => {
      boardsRepo.getCardById
        .mockResolvedValueOnce(cardC)
        .mockResolvedValueOnce(cardD);

      const result = await service.moveCard(
        userId,
        boardId,
        columnId,
        cardId,
        cardA.id,
        cardB.id,
      );

      expect(boardsRepo.moveCard).toHaveBeenCalledWith(
        cardA.id,
        toColumnId,
        3500,
        {},
      );
      expect(result.message).toBe('Card moved successfully');
    });

    it('throws BoardNotFound when board does not exist', async () => {
      boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(undefined);

      await expect(
        service.moveCard(userId, boardId, columnId, cardId, cardA.id, cardB.id),
      ).rejects.toThrow();
    });

    it('throws ColumnNotFound when column does not exist', async () => {
      boardsRepo.getColumnById.mockResolvedValue(undefined);

      await expect(
        service.moveCard(userId, boardId, columnId, cardId, cardA.id, cardB.id),
      ).rejects.toThrow();
    });

    it('throws CardNotFound when card does not exist', async () => {
      boardsRepo.getCardById
        .mockResolvedValueOnce(cardC)
        .mockResolvedValueOnce(cardD);
      boardsRepo.moveCard.mockResolvedValue(null);

      await expect(
        service.moveCard(userId, boardId, columnId, cardId, cardA.id, cardB.id),
      ).rejects.toThrow();
    });
  });

  it('should get boards', async () => {
    const boards = [
      {
        id: 1,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        description: 'wee',
        owner_id: 45,
        title: 'board1',
        color: null,
      },
    ];
    boardsRepo.getBoards.mockResolvedValue(boards);
    const result = await service.getBoards(userId);
    expect(result).toEqual(boards);
  });

  it('should create board', async () => {
    const boardData = {
      title: 'New Board',
      description: 'A new board',
      color: undefined,
    };
    const createdBoard = {
      id: 1,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      description: 'A new board',
      owner_id: 1,
      title: 'New Board',
      color: null,
    };
    boardsRepo.createBoardWithLimit.mockResolvedValue(createdBoard);
    const result = await service.createBoard(userId, boardData);
    expect(result).toEqual(createdBoard);
  });

  it('throws KanbanException with TooManyBoards when board limit is reached', async () => {
    const boardData = {
      title: 'New Board',
      description: 'A new board',
      color: undefined,
    };
    boardsRepo.createBoardWithLimit.mockResolvedValue(null);
    await expect(service.createBoard(userId, boardData)).rejects.toThrow(
      KanbanException,
    );
  });

  it('should get board with columns', async () => {
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    const result = await service.getBoardWithColumns(userId, boardId);
    expect(result).toEqual(board);
  });

  it('throws KanbanException with BoardNotFound when board does not exist', async () => {
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(undefined);
    await expect(service.getBoardWithColumns(userId, boardId)).rejects.toThrow(
      KanbanException,
    );
  });

  it('should update column', async () => {
    const updateData = { title: 'Updated Column' };
    const updatedColumn = {
      id: 1,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      title: 'Updated Column',
      board_id: 1,
      position: 1,
    };
    boardsRepo.updateColumn.mockResolvedValue(updatedColumn);
    const result = await service.updateColumn(
      userId,
      boardId,
      columnId,
      updateData,
    );
    expect(result).toEqual(updatedColumn);
  });

  it('throws KanbanException with ColumnNotFound when column does not exist', async () => {
    boardsRepo.updateColumn.mockResolvedValue(null);
    await expect(
      service.updateColumn(userId, boardId, columnId, { title: 'x' }),
    ).rejects.toThrow(KanbanException);
  });

  it('should delete column', async () => {
    boardsRepo.deleteColumn.mockResolvedValue(true);
    const result = await service.deleteColumn(userId, boardId, columnId);
    expect(result).toEqual(true);
  });

  it('should create card', async () => {
    const cardData = {
      title: 'Test Card',
      position: 1,
      description: 'Test Description',
    };
    const createdCard = {
      id: 1,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      title: 'Test Card',
      position: 1,
      description: 'Test Description',
      column_id: columnId,
    };
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    boardsRepo.createCardWithLimit.mockResolvedValue(createdCard);
    const result = await service.createCard(
      userId,
      boardId,
      columnId,
      cardData,
    );
    expect(result).toEqual(createdCard);
  });

  it('throws KanbanException with BoardNotFound when board does not exist on createCard', async () => {
    const cardData = {
      title: 'Test Card',
      position: 1,
      description: 'Test Description',
    };
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(undefined);
    await expect(
      service.createCard(userId, boardId, columnId, cardData),
    ).rejects.toThrow(KanbanException);
  });

  it('throws KanbanException with TooManyCardsInColumn when card limit is reached', async () => {
    const cardData = {
      title: 'Test Card',
      position: 1,
      description: 'Test Description',
    };
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    boardsRepo.createCardWithLimit.mockResolvedValue(null);
    await expect(
      service.createCard(userId, boardId, columnId, cardData),
    ).rejects.toThrow(KanbanException);
  });

  it('should update the card', async () => {
    const updateData = {
      title: 'Updated Card',
      position: 2,
      description: 'Updated Description',
    };
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    boardsRepo.updateCard.mockResolvedValue(updatedCard);
    const result = await service.updateCard(
      userId,
      boardId,
      columnId,
      cardId,
      updateData,
    );
    expect(result).toEqual(updatedCard);
  });

  it('should delete the card', async () => {
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    boardsRepo.deleteCard.mockResolvedValue(true);
    const result = await service.deleteCard(userId, boardId, columnId, cardId);
    expect(result).toEqual(true);
  });

  it('throws KanbanException with CardNotFound when deleteCard returns false', async () => {
    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    boardsRepo.deleteCard.mockResolvedValue(false);
    await expect(
      service.deleteCard(userId, boardId, columnId, cardId),
    ).rejects.toThrow(KanbanException);
  });
});
