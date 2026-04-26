import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';

export type KanbanErrorCode =
  | 'TooManyBoards'
  | 'TooManyColumns'
  | 'TooManyCardsInColumn'
  | 'TooManyCardsInBoard'
  | 'BoardNotFound'
  | 'ColumnNotFound'
  | 'CardNotFound'
  | 'DuplicateBoardTitle'
  | 'InvalidNeighbour';

export class KanbanException extends ForbiddenException {
  constructor(code: KanbanErrorCode, message: string) {
    super({ statusCode: HttpStatus.FORBIDDEN, code, message });
  }
}

export class KanbanConflictException extends ConflictException {
  constructor(code: KanbanErrorCode, message: string) {
    super({ statusCode: HttpStatus.CONFLICT, code, message });
  }
}
