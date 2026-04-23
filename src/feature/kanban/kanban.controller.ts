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
  Delete,
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
import {
  CreateColumnSchema,
  UpdateColumnSchema,
  type UpdateColumnType,
  type CreateColumnType,
} from './schemas/column.schema';

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

  @Delete('board/:boardId')
  @HttpCode(204)
  deleteBoard(
    @CurrentUser() user: JwtUser,
    @Param('boardId', ParseIntPipe) boardId: number,
  ) {
    return this.kanbanService.deleteBoard(user.id, boardId);
  }
  // columns
  @Get('boards/:boardId/columns')
  getColumns(
    @CurrentUser() user: JwtUser,
    @Param('boardId', ParseIntPipe) boardId: number,
  ) {
    return this.kanbanService.getColumns(user.id, boardId);
  }

  @Post('boards/:boardId/columns')
  @HttpCode(201)
  createColumn(
    @CurrentUser() user: JwtUser,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body(new ZodValidationPipe(CreateColumnSchema)) column: CreateColumnType,
  ) {
    return this.kanbanService.createColumn(user.id, boardId, column);
  }

  @Patch('boards/:boardId/columns/:columnId')
  updateColumn(
    @CurrentUser() user: JwtUser,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Body(new ZodValidationPipe(UpdateColumnSchema))
    updateData: UpdateColumnType,
  ) {
    return this.kanbanService.updateColumn(
      user.id,
      boardId,
      columnId,
      updateData,
    );
  }

  @Delete('boards/:boardId/columns/:columnId')
  @HttpCode(204)
  deleteColumn(
    @CurrentUser() user: JwtUser,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
  ) {
    return this.kanbanService.deleteColumn(user.id, boardId, columnId);
  }
}
