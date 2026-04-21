import { Module } from '@nestjs/common';
import { KanbanService } from './kanban.service';
import { KanbanController } from './kanban.controller';
import { BoardsRepository } from './repositories/boards.repository';
import { DatabaseModule } from '@db/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [KanbanService, BoardsRepository],
  controllers: [KanbanController],
})
export class KanbanModule {}
