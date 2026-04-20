import { Test, TestingModule } from '@nestjs/testing';
import { TokenCleanupTask } from './token-cleanup.task';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';

type RepoMock = jest.Mocked<
  Pick<RefreshTokensRepository, 'deleteExpiredTokens'>
>;

describe('TokenCleanupTask', () => {
  let task: TokenCleanupTask;
  let repo: RepoMock;

  beforeEach(async () => {
    repo = {
      deleteExpiredTokens: jest.fn().mockResolvedValue(undefined),
    } as RepoMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenCleanupTask,
        { provide: RefreshTokensRepository, useValue: repo },
      ],
    }).compile();

    task = module.get(TokenCleanupTask);
  });

  it('handleCron deletes expired refresh tokens', async () => {
    await task.handleCron();
    expect(repo.deleteExpiredTokens).toHaveBeenCalledTimes(1);
  });
});
