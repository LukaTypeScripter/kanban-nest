import {
  Injectable,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { BoardsRepository } from './repositories/boards.repository';
import { Board, CreateBoardType } from './schemas/board.schema';
import { MAX_BOARDS_PER_USER } from './constants/max-board-user.constant';

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

  async createBoard(ownerId: number, board: CreateBoardType): Promise<Board> {
    this.logger.log(`createBoard ownerId=${ownerId}`);

    try {
      const created = await this.boardsRepository.createBoardWithLimit(
        ownerId,
        board,
        MAX_BOARDS_PER_USER,
      );

      if (!created)
        throw new ForbiddenException(
          `You can't have more than ${MAX_BOARDS_PER_USER} boards`,
        );

      return created;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;

      if (err instanceof Error) {
        this.logger.error(err.message, err.stack);

        if ((err as unknown as { code?: string }).code === '23505') {
          throw new ConflictException('Board with this title already exists');
        }
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
