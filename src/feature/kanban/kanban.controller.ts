import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Patch,
  UseGuards,
  HttpCode,
  Param,
} from '@nestjs/common';
import { KanbanService } from './kanban.service';
import {
  CreateBoardSchema,
  UpdateBoardSchema,
  type UpdateBoardType,
  type CreateBoardType,
} from './schemas/board.schema';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { CurrentUser } from '@common/decorators/current-user.decorator';

type JwtUser = { id: number; email: string; emailVerified: boolean };

@Controller('kanban')
@UseGuards(AuthGuard('jwt'))
export class KanbanController {
  constructor(private kanbanService: KanbanService) {}

  @Get('boards')
  getBoards(@CurrentUser() user: JwtUser) {
    return this.kanbanService.getBoards(user.id);
  }

  @Post('boards')
  @HttpCode(201)
  createBoard(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateBoardSchema)) board: CreateBoardType,
  ) {
    return this.kanbanService.createBoard(user.id, board);
  }

  @Get('boards/:boardId')
  getBoardWithColumns(
    @CurrentUser() user: JwtUser,
    @Param('boardId', ParseIntPipe) boardId: number,
  ) {
    return this.kanbanService.getBoardWithColumns(user.id, boardId);
  }

  @Patch('board/:boardId')
  updateBoard(
    @CurrentUser() user: JwtUser,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body(new ZodValidationPipe(UpdateBoardSchema)) updateData: UpdateBoardType,
  ) {
    return this.kanbanService.updateBoard(user.id, boardId, updateData);
  }
}
