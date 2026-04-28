import { Injectable, ForbiddenException, Logger, Next } from '@nestjs/common';
import { BoardsRepository } from './repositories/boards.repository';
import {
  Board,
  CreateBoardType,
  UpdateBoardType,
} from './schemas/board.schema';
import { MAX_BOARDS_PER_USER } from './constants/max-board-user.constant';
import {
  CreateColumnType,
  UpdateColumnType,
  ColumnType,
} from './schemas/column.schema';
import { MAX_COLUMNS_PER_BOARD } from './constants/max-column-count.constant';
import {
  CardType,
  CreateCardType,
  UpdateCardType,
} from './schemas/card.schema';
import { MAX_CARDS_PER_COLUMN } from './constants/max-card.constant';
import { KanbanConflictException, KanbanException } from './kanban.exception';
import { Tx } from '@common/types/transaction.type';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(private boardsRepository: BoardsRepository) {}

  handleDuplicationTitleError(error: unknown): never {
    if (error instanceof ForbiddenException) throw error;

    if (error instanceof Error) {
      this.logger.error(error.message, error.stack);

      if ((error as unknown as { code?: string }).code === '23505') {
        throw new KanbanConflictException(
          'DuplicateBoardTitle',
          'Board with this title already exists',
        );
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
        throw new KanbanException(
          'TooManyBoards',
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

      if (!board) throw new KanbanException('BoardNotFound', 'Board not found');

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
        throw new KanbanException('BoardNotFound', 'Board not found');

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
        throw new KanbanException('BoardNotFound', 'Board not found');
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  // columns

  async getColumns(
    ownerId: number,
    boardId: number,
  ): Promise<ColumnType[] | undefined> {
    this.logger.log(`getColumns ownerId=${ownerId} boardId=${boardId}`);

    try {
      const board = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );
      if (!board) throw new KanbanException('BoardNotFound', 'Board not found');

      return board.columns;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async createColumn(
    ownerId: number,
    boardId: number,
    column: CreateColumnType,
  ): Promise<CreateColumnType> {
    this.logger.log(`createColumn ownerId=${ownerId} boardId=${boardId}`);

    try {
      const created = await this.boardsRepository.createColumnWithLimit(
        boardId,
        column,
        MAX_COLUMNS_PER_BOARD,
      );

      if (!created)
        throw new KanbanException(
          'TooManyColumns',
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
  ): Promise<UpdateColumnType> {
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
        throw new KanbanException('ColumnNotFound', 'Column not found');

      return updated;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async deleteColumn(
    ownerId: number,
    boardId: number,
    columnId: number,
  ): Promise<boolean> {
    this.logger.log(
      `deleteColumn ownerId=${ownerId} boardId=${boardId} columnId=${columnId}`,
    );

    try {
      const isDeleted = await this.boardsRepository.deleteColumn(
        boardId,
        columnId,
      );

      if (!isDeleted)
        throw new KanbanException('ColumnNotFound', 'Column not found');

      return isDeleted;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  // cards

  async getCards(
    ownerId: number,
    boardId: number,
    columnId: number,
  ): Promise<CardType[]> {
    this.logger.log(
      `getCards ownerId=${ownerId} boardId=${boardId} columnId=${columnId}`,
    );

    try {
      const board = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );

      if (!board) throw new KanbanException('BoardNotFound', 'Board not found');

      const columnInBoard = board.columns.some((c) => c.id === columnId);
      if (!columnInBoard)
        throw new KanbanException('ColumnNotFound', 'Column not found');

      return await this.boardsRepository.getCardsInColumn(columnId);
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async createCard(
    ownerId: number,
    boardId: number,
    columnId: number,
    card: CreateCardType,
  ): Promise<CardType> {
    this.logger.log(
      `createCard ownerId=${ownerId} boardId=${boardId} columnId=${columnId}`,
    );

    try {
      const boardExists = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );

      if (!boardExists)
        throw new KanbanException('BoardNotFound', 'Board not found');

      const created = await this.boardsRepository.createCardWithLimit(
        columnId,
        card,
        MAX_CARDS_PER_COLUMN,
      );

      if (!created)
        throw new KanbanException(
          'TooManyCardsInColumn',
          `You can't have more than ${MAX_CARDS_PER_COLUMN} cards per column`,
        );

      return created;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async getCardById(
    ownerId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Promise<CardType | undefined> {
    this.logger.log(
      `getCardById ownerId=${ownerId} boardId=${boardId} columnId=${columnId} cardId=${cardId}`,
    );

    const card = await this.boardsRepository.getCardsAndValidate(
      columnId,
      ownerId,
      cardId,
      boardId,
    );

    if (!card) throw new KanbanException('CardNotFound', 'Card not found');

    return card;
  }

  async updateCard(
    ownerId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    updateData: UpdateCardType,
  ): Promise<CardType> {
    this.logger.log(
      `updateCard ownerId=${ownerId} boardId=${boardId} columnId=${columnId} cardId=${cardId}`,
    );

    try {
      const boardExists = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );

      if (!boardExists)
        throw new KanbanException('BoardNotFound', 'Board not found');

      const updated = await this.boardsRepository.updateCard(
        columnId,
        cardId,
        updateData,
      );

      if (!updated) throw new KanbanException('CardNotFound', 'Card not found');

      return updated;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async deleteCard(
    ownerId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Promise<boolean> {
    this.logger.log(
      `deleteCard ownerId=${ownerId} boardId=${boardId} columnId=${columnId} cardId=${cardId}`,
    );

    try {
      const boardExists = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );

      if (!boardExists)
        throw new KanbanException('BoardNotFound', 'Board not found');

      const deleted = await this.boardsRepository.deleteCard(columnId, cardId);

      if (!deleted) throw new KanbanException('CardNotFound', 'Card not found');

      return deleted;
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  async moveCard(
    ownerId: number,
    boardId: number,
    toColumnId: number,
    cardId: number,
    beforeCardId: number,
    afterCardId: number,
  ): Promise<{ message: string; result: CardType[] }> {
    this.logger.log(
      `moveCard ownerId=${ownerId} boardId=${boardId} columnId=${toColumnId} cardId=${cardId} beforeCardId=${beforeCardId} afterCardId=${afterCardId}`,
    );

    try {
      const boardExists = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );

      if (!boardExists)
        throw new KanbanException('BoardNotFound', 'Board not found');

      const columnExists =
        await this.boardsRepository.getColumnById(toColumnId);

      if (!columnExists)
        throw new KanbanException('ColumnNotFound', 'Column not found');

      const result = await this.boardsRepository.transaction.runInTransaction(
        async (tx) => {
          const prev = beforeCardId
            ? await this.boardsRepository.getCardById(beforeCardId, tx)
            : null;
          const next = afterCardId
            ? await this.boardsRepository.getCardById(afterCardId, tx)
            : null;

          let pos = this.pickPosition(
            prev?.position ?? null,
            next?.position ?? null,
          );

          this.logger.log(
            `pickPosition prev=${prev?.position} next=${next?.position} pos=${pos}`,
          );

          if (pos === null) {
            await this.boardsRepository.normalizeColumnPositions(
              toColumnId,
              tx,
            );

            const p = beforeCardId
              ? await this.boardsRepository.getCardById(beforeCardId, tx)
              : null;

            const r = afterCardId
              ? await this.boardsRepository.getCardById(afterCardId, tx)
              : null;

            pos = this.pickPosition(p?.position ?? null, r?.position ?? null);
          }

          if (pos === null)
            throw new KanbanException('PositionNotFound', 'Position not found');

          const moved = await this.boardsRepository.moveCard(
            cardId,
            toColumnId,
            pos,
            tx,
          );

          if (!moved)
            throw new KanbanException('CardNotFound', 'Card not found');

          return this.boardsRepository.getCardsInColumn(toColumnId, tx);
        },
      );

      if (result === null)
        throw new KanbanException('CardNotFound', 'Card not found');

      return { message: 'Card moved successfully', result };
    } catch (err) {
      this.handleNormalError(err);
    }
  }

  pickPosition(
    prevPosition: number | null,
    nextPosition: number | null,
  ): number | null {
    const PAD = 1000;

    if (prevPosition === null && nextPosition === null) return PAD;
    if (prevPosition === null) return nextPosition! - PAD;
    if (nextPosition === null) return prevPosition! + PAD;

    if (nextPosition! - prevPosition! > 1)
      return Math.floor((prevPosition! + nextPosition!) / 2);

    return null;
  }
}
