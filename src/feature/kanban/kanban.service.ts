import {
  Injectable,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { BoardsRepository } from './repositories/boards.repository';
import { CreateBoardType } from './schemas/board.schema';

const MAX_BOARDS_PER_USER = 50;

@Injectable()
export class KanbanService {
  constructor(private boardsRepository: BoardsRepository) {}

  async getBoards(userId: number) {
    return await this.boardsRepository.getBoards(userId);
  }

  async createBoard(ownerId: number, board: CreateBoardType) {
    const count = await this.boardsRepository.getOwnedBoardsCount(ownerId);

    if (count >= MAX_BOARDS_PER_USER)
      throw new ForbiddenException(
        `You can't have more than ${MAX_BOARDS_PER_USER} boards`,
      );

    try {
      const [created] = await this.boardsRepository.createBoard(ownerId, board);
      return created;
    } catch (err) {
      if (
        err instanceof Error &&
        (err as unknown as { code: string }).code === '23505'
      )
        throw new ConflictException('A board with this title already exists');
      throw err;
    }
  }
}
