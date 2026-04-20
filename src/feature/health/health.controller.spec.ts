import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DrizzleHealthIndicator } from './indicators/drizzle-health.indicator';

type HealthCheckServiceMock = jest.Mocked<Pick<HealthCheckService, 'check'>>;
type DrizzleHealthIndicatorMock = jest.Mocked<
  Pick<DrizzleHealthIndicator, 'isHealthy'>
>;

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheck: HealthCheckServiceMock;
  let dbIndicator: DrizzleHealthIndicatorMock;

  beforeEach(async () => {
    healthCheck = {
      check: jest.fn(),
    } as HealthCheckServiceMock;

    dbIndicator = {
      isHealthy: jest.fn(),
    } as DrizzleHealthIndicatorMock;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheck },
        { provide: DrizzleHealthIndicator, useValue: dbIndicator },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('liveness', () => {
    it('runs an empty check (process-alive signal only)', async () => {
      const expected = {
        status: 'ok' as const,
        info: {},
        error: {},
        details: {},
      };
      healthCheck.check.mockResolvedValue(expected);

      const result = await controller.liveness();

      expect(healthCheck.check).toHaveBeenCalledWith([]);
      expect(result).toEqual(expected);
    });
  });

  describe('readiness', () => {
    it('runs a check that invokes the database indicator', async () => {
      const expected = {
        status: 'ok' as const,
        info: {},
        error: {},
        details: {},
      };
      healthCheck.check.mockImplementation(async (indicators) => {
        for (const indicator of indicators) await indicator();
        return expected;
      });

      const result = await controller.readiness();

      expect(healthCheck.check).toHaveBeenCalledTimes(1);
      expect(dbIndicator.isHealthy).toHaveBeenCalledWith('database');
      expect(result).toEqual(expected);
    });
  });
});
