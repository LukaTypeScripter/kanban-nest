import { Test, TestingModule } from '@nestjs/testing';
import { KanbanService } from './kanban.service';
import { BoardsRepository } from './repositories/boards.repository';
import { ForbiddenException } from '@nestjs/common';

type BoardRepoMock = jest.Mocked<
  Pick<
    BoardsRepository,
    | 'getBoards'
    | 'getBoardByIdAndOwnerId'
    | 'createBoardWithLimit'
    | 'updateColumn'
    | 'deleteColumn'
    | 'createColumnWithLimit'
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
  } as BoardRepoMock;

  beforeEach(async () => {
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

  it('should get boards', async () => {
    const userId = 1;
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
    const ownerId = 1;
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

    const result = await service.createBoard(ownerId, boardData);
    expect(result).toEqual(createdBoard);
  });

  it('should throw an error if the user has too many boards', async () => {
    const ownerId = 1;
    const boardData = {
      title: 'New Board',
      description: 'A new board',
      color: undefined,
    };
    boardsRepo.createBoardWithLimit.mockResolvedValue(null);
    await expect(service.createBoard(ownerId, boardData)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should get board with columns', async () => {
    const userId = 1;
    const boardId = 1;
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

    boardsRepo.getBoardByIdAndOwnerId.mockResolvedValue(board);
    const result = await service.getBoardWithColumns(userId, boardId);
    expect(result).toEqual(board);
  });

  it('should update column', async () => {
    const ownerId = 1;
    const boardId = 1;
    const columnId = 1;
    const updateData = {
      title: 'Updated Column',
    };
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
      ownerId,
      boardId,
      columnId,
      updateData,
    );
    expect(result).toEqual(updatedColumn);
  });

  it('should throw an error if the column is not found', async () => {
    const ownerId = 1;
    const boardId = 1;
    const columnId = 1;
    const updateData = {
      title: 'Updated Column',
    };
    boardsRepo.updateColumn.mockResolvedValue(null);
    await expect(
      service.updateColumn(ownerId, boardId, columnId, updateData),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should delete column', async () => {
    const ownerId = 1;
    const boardId = 1;
    const columnId = 1;
    boardsRepo.deleteColumn.mockResolvedValue(true);
    const result = await service.deleteColumn(ownerId, boardId, columnId);
    expect(result).toEqual(true);
  });
});
