import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
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
    columnId: number,
    cardId: number,
    newColumnId: number,
    positionIndex: number,
    toColumnId: number,
    fromColumnId: number,
    fromPositionIndex: number,
  ): Promise<CardType> {
    this.logger.log(
      `moveCard ownerId=${ownerId} boardId=${boardId} columnId=${columnId} cardId=${cardId} newColumnId=${newColumnId} toColumnId=${toColumnId} fromColumnId=${fromColumnId} fromPosition=${fromPositionIndex}`,
    );

    try {
      const boardExists = await this.boardsRepository.getBoardByIdAndOwnerId(
        boardId,
        ownerId,
      );

      if (!boardExists)
        throw new KanbanException('BoardNotFound', 'Board not found');

      const columnExists = await this.boardsRepository.getColumnById(columnId);

      if (!columnExists)
        throw new KanbanException('ColumnNotFound', 'Column not found');

      const cardsInColumn =
        await this.boardsRepository.getCardsInColumn(columnId);

      if (!cardsInColumn)
        throw new KanbanException('ColumnNotFound', 'Column not found');

      let updated: CardType | null;

      if (cardsInColumn.length === 0) {
        // first card in clumn
        const position = 1000;
        updated = await this.boardsRepository.moveCard(
          columnId,
          cardId,
          newColumnId,
          position,
        );
      } else {
        // index should be 1,2,3 so front should do index + 1

        if (toColumnId === fromColumnId) {
          const positionFromIndex = positionIndex * 1000;

          const cardAtPosition = await this.boardsRepository.getCardByPosition(
            columnId,
            positionFromIndex,
          );

          if (cardAtPosition) {
            // position index = 2
            // cardsInColumn.length = 5
            // cardsInColumn[3] will be moved to position 4000 (was 3000)
            // cardsInColumn[4] will be moved to position 5000 (was 4000)

            for (let i = positionIndex + 1; i < cardsInColumn.length; i++) {
              const card = cardsInColumn[i];
              await this.boardsRepository.moveCard(
                columnId,
                card.id,
                newColumnId,
                card.position + 1000,
              );
            }
          }

          updated = await this.boardsRepository.moveCard(
            columnId,
            cardId,
            newColumnId,
            positionFromIndex,
          );
        } else {

          const fromInColumn =


          // from column adjustment
          for (let i = fromPositionIndex; i < cardsInColumn.length; i++) {
            const card = cardsInColumn[i];
            await this.boardsRepository.moveCard(
              columnId,
              card.id,
              newColumnId,
              card.position + 1000,
            );
          }
        }
      }

      if (!updated) throw new KanbanException('CardNotFound', 'Card not found');

      return updated;
    } catch (err) {
      this.handleNormalError(err);
    }
  }
}
