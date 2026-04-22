import { Test, TestingModule } from '@nestjs/testing';
import { KanbanService } from './kanban.service';
import { BoardsRepository } from './repositories/boards.repository';
import { MAX_BOARDS_PER_USER } from './constants/max-board-user.constant';
import { ForbiddenException } from '@nestjs/common';

type BoardRepoMock = jest.Mocked<
  Pick<
    BoardsRepository,
    | 'getBoards'
    | 'getBoardByIdAndOwnerId'
    | 'getOwnedBoardsCount'
    | 'createBoard'
  >
>;

describe('KanbanService', () => {
  let service: KanbanService;

  const boardsRepo = {
    getBoards: jest.fn(),
    getBoardByIdAndOwnerId: jest.fn(),
    getOwnedBoardsCount: jest.fn(),
    createBoard: jest.fn(),
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

    boardsRepo.getOwnedBoardsCount.mockResolvedValue(0);
    boardsRepo.createBoard.mockResolvedValue([createdBoard]);

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
    boardsRepo.getOwnedBoardsCount.mockResolvedValue(MAX_BOARDS_PER_USER);
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
});
