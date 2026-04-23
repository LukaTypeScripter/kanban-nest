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
import { CreateColumnType, UpdateColumnType } from './schemas/column.schema';
import { MAX_COLUMNS_PER_BOARD } from './constants/max-column-count.constant';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(private boardsRepository: BoardsRepository) {}

  handleDuplicationTitleError(error: unknown): never {
    if (error instanceof ForbiddenException) throw error;

    if (error instanceof Error) {
      this.logger.error(error.message, error.stack);

      if ((error as unknown as { code?: string }).code === '23505') {
        throw new ConflictException('Board with this title already exists');
      }
    }

    throw error;
  }

  handleNormalError(error: unknown): never {
    if (error instanceof ForbiddenException) throw error;
    if (error instanceof Error) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }

  async getBoards(userId: number) {
    this.logger.log(`getBoards userId=${userId}`);

    try {
      const boards = await this.boardsRepository.getBoards(userId);
      return boards;
    } catch (err) {
      this.handleNormalError(err);
    }
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
    }
  }

  async getBoardWithColumns(userId: number, boardId: number) {
    this.logger.log(`getBoardWithColumns userId=${userId} boardId=${boardId}`);
    try {
      const board = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        userId,
      );

      if (!board)
        throw new ForbiddenException('Access to this board is forbidden');

      return board;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async updateBoard(
    ownerId: number,
    boardId: number,
    updateData: UpdateBoardType,
  ) {
    this.logger.log(`updateBoard ownerId=${ownerId} boardId=${boardId}`);

    try {
      const updated = await this.boardsRepository.updateBoard(
        ownerId,
        boardId,
        updateData,
      );

      if (!updated)
        throw new ForbiddenException(
          'update failed. Access to this board is forbidden or board does not exist',
        );

      return updated;
    } catch (err) {
      this.handleDuplicationTitleError(err);
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
      this.handleNormalError(err);
    }
  }

  // columns

  async getColumns(ownerId: number, boardId: number) {
    this.logger.log(`getColumns ownerId=${ownerId} boardId=${boardId}`);

    try {
      const board = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );
      if (!board)
        throw new ForbiddenException('Access to this board is forbidden');

      return board.columns;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async createColumn(
    ownerId: number,
    boardId: number,
    column: CreateColumnType,
  ) {
    this.logger.log(`createColumn ownerId=${ownerId} boardId=${boardId}`);

    try {
      const created = await this.boardsRepository.createColumnWithLimit(
        boardId,
        column,
        MAX_COLUMNS_PER_BOARD,
      );

      if (!created)
        throw new ForbiddenException(
          `You can't have more than ${MAX_COLUMNS_PER_BOARD} columns per board`,
        );

      return created;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async updateColumn(
    ownerId: number,
    boardId: number,
    columnId: number,
    updateData: UpdateColumnType,
  ) {
    this.logger.log(
      `updateColumn ownerId=${ownerId} boardId=${boardId} columnId=${columnId}`,
    );

    try {
      const updated = await this.boardsRepository.updateColumn(
        boardId,
        columnId,
        updateData,
      );

      if (!updated)
        throw new ForbiddenException(
          'update failed. Access to this column is forbidden or column does not exist',
        );

      return updated;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async deleteColumn(ownerId: number, boardId: number, columnId: number) {
    this.logger.log(
      `deleteColumn ownerId=${ownerId} boardId=${boardId} columnId=${columnId}`,
    );

    try {
      const isDeleted = await this.boardsRepository.deleteColumn(
        boardId,
        columnId,
      );

      if (!isDeleted)
        throw new ForbiddenException(
          'deletion failed. Access to this column is forbidden or column does not exist',
        );

      return isDeleted;
    } catch (err) {
      this.handleNormalError(err);
    }
  }
}
