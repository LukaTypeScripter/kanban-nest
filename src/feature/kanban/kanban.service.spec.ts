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
  >
>;

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
  } as BoardRepoMock;

  const userId = 1;
  const boardId = 1;
  const columnId = 1;
  const cardId = 1;

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
