import { Test, TestingModule } from '@nestjs/testing';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';

const kanbanServiceMock: jest.Mocked<
  Pick<KanbanService, 'getBoards' | 'createBoard' | 'getBoardWithColumns'>
> = {
  getBoards: jest.fn(),
  createBoard: jest.fn(),
  getBoardWithColumns: jest.fn(),
};

describe('KanbanController', () => {
  let controller: KanbanController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KanbanController],
      providers: [{ provide: KanbanService, useValue: kanbanServiceMock }],
    }).compile();

    controller = module.get<KanbanController>(KanbanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
