import {
  Injectable,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { BoardsRepository } from './repositories/boards.repository';
import {
  Board,
  CreateBoardType,
  UpdateBoardType,
} from './schemas/board.schema';
import { MAX_BOARDS_PER_USER } from './constants/max-board-user.constant';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(private boardsRepository: BoardsRepository) {}

  handleDuplicationTitleError(error: unknown) {
    if (error instanceof ForbiddenException) throw error;

    if (error instanceof Error) {
      this.logger.error(error.message, error.stack);

      if ((error as unknown as { code?: string }).code === '23505') {
        throw new ConflictException('Board with this title already exists');
      }
    }

    throw error;
  }

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
      this.handleDuplicationTitleError(err);

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

  async updateBoard(
    ownerId: number,
    boardId: number,
    updateData: UpdateBoardType,
  ) {
    this.logger.log(`updateBoard ownerId=${ownerId} boardId=${boardId}`);

    try {
      const updated = await this.boardsRepository
        .updateBoard(ownerId, boardId, updateData)
        .catch((err: Error) => {
          this.logger.error(err.message, err.stack);
          throw err;
        });

      if (!updated)
        throw new ForbiddenException(
          'update failed. Access to this board is forbidden or board does not exist',
        );

      return { message: 'Board updated successfully', board: updated };
    } catch (err) {
      this.handleDuplicationTitleError(err);

      throw err;
    }
  }

  async deleteBoard(ownerId: number, boardId: number) {
    this.logger.log(`deleteBoard ownerId=${ownerId} boardId=${boardId}`);

    try {
      const isDeleted = await this.boardsRepository.deleteBoard(
        ownerId,
        boardId,
      );

      if (!isDeleted)
        throw new ForbiddenException(
          'deletion failed. Access to this board is forbidden or board does not exist',
        );
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;

      if (err instanceof Error) {
        this.logger.error(err.message, err.stack);
      }

      throw err;
    }
  }
}
