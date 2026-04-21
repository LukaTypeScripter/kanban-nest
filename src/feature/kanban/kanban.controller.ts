import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { KanbanService } from './kanban.service';
import {
  CreateBoardSchema,
  type CreateBoardType,
} from './schemas/board.schema';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

type JwtUser = { id: number; email: string; emailVerified: boolean };

@Controller('kanban')
@UseGuards(AuthGuard('jwt'))
export class KanbanController {
  constructor(private kanbanService: KanbanService) {}

  @Get('boards')
  getBoards(@Req() req: Request & { user: JwtUser }) {
    return this.kanbanService.getBoards(req.user.id);
  }

  @Post('boards')
  @HttpCode(201)
  createBoard(
    @Req() req: Request & { user: JwtUser },
    @Body(new ZodValidationPipe(CreateBoardSchema)) board: CreateBoardType,
  ) {
    return this.kanbanService.createBoard(req.user.id, board);
  }

  @Get('board/with-columns')
  getBoardWithColumns(
    @Req() req: Request & { user: JwtUser },
    @Query('boardId', ParseIntPipe) boardId: number,
  ) {
    return this.kanbanService.getBoardWithColumns(req.user.id, boardId);
  }
}
