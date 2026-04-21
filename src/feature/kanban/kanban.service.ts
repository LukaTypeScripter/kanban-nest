import {
  Injectable,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { BoardsRepository } from './repositories/boards.repository';
import { CreateBoardType } from './schemas/board.schema';

const MAX_BOARDS_PER_USER = 50;

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(private boardsRepository: BoardsRepository) {}

  getBoards(userId: number) {
    this.logger.log(`getBoards userId=${userId}`);
    return this.boardsRepository.getBoards(userId).catch((err: Error) => {
      this.logger.error(err.message, err.stack);
      throw err;
    });
  }

  async createBoard(ownerId: number, board: CreateBoardType) {
    this.logger.log(`createBoard ownerId=${ownerId}`);
    const count = await this.boardsRepository.getOwnedBoardsCount(ownerId);

    if (count >= MAX_BOARDS_PER_USER)
      throw new ForbiddenException(
        `You can't have more than ${MAX_BOARDS_PER_USER} boards`,
      );

    try {
      const [created] = await this.boardsRepository.createBoard(ownerId, board);
      return created;
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error(err.message, err.stack);
        if ((err as unknown as { code: string }).code === '23505')
          throw new ConflictException('A board with this title already exists');
      }
      throw err;
    }
  }

  async getBoardWithColumns(userId: number, boardId: number) {
    this.logger.log(`getBoardWithColumns userId=${userId} boardId=${boardId}`);
    const board = await this.boardsRepository.getBoardByIdAndOwnerId(
      boardId,
      userId,
    );

    if (!board)
      throw new ForbiddenException('Access to this board is forbidden');

    return board;
  }
}
