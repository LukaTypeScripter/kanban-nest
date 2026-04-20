import { Test, TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { DrizzleAsyncProvider } from '@db/database/database.provider';
import { DrizzleHealthIndicator } from './drizzle-health.indicator';

describe('DrizzleHealthIndicator', () => {
  let indicator: DrizzleHealthIndicator;
  let db: { execute: jest.Mock };
  let session: { up: jest.Mock; down: jest.Mock };
  let healthIndicatorService: { check: jest.Mock };

  beforeEach(async () => {
    db = { execute: jest.fn() };
    session = {
      up: jest.fn().mockReturnValue({ database: { status: 'up' } }),
      down: jest.fn().mockReturnValue({ database: { status: 'down' } }),
    };
    healthIndicatorService = {
      check: jest.fn().mockReturnValue(session),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrizzleHealthIndicator,
        {
          provide: HealthIndicatorService,
          useValue: healthIndicatorService,
        },
        { provide: DrizzleAsyncProvider, useValue: db },
      ],
    }).compile();

    indicator = module.get(DrizzleHealthIndicator);
  });

  it('returns up() when the DB responds to SELECT 1', async () => {
    db.execute.mockResolvedValue([]);

    const result = await indicator.isHealthy('database');

    expect(db.execute).toHaveBeenCalledWith('SELECT 1');
    expect(healthIndicatorService.check).toHaveBeenCalledWith('database');
    expect(session.up).toHaveBeenCalled();
    expect(session.down).not.toHaveBeenCalled();
    expect(result).toEqual({ database: { status: 'up' } });
  });

  it('returns down() with the error message when the DB throws', async () => {
    db.execute.mockRejectedValue(new Error('connection refused'));

    const result = await indicator.isHealthy('database');

    expect(session.up).not.toHaveBeenCalled();
    expect(session.down).toHaveBeenCalledWith({
      message: 'connection refused',
    });
    expect(result).toEqual({ database: { status: 'down' } });
  });
});
