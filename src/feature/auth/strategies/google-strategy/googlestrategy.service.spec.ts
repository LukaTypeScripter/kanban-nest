import { Test, TestingModule } from '@nestjs/testing';
import { GooglestrategyService } from './googlestrategy.service';

describe('GooglestrategyService', () => {
  let service: GooglestrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GooglestrategyService],
    }).compile();

    service = module.get<GooglestrategyService>(GooglestrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
