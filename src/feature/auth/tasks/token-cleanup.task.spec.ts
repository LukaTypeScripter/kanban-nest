import { Test, TestingModule } from '@nestjs/testing';
import { TokenCleanupTask } from './token-cleanup.task';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';
import { EmailVerificationRepository } from '../repositories/email-verification.repository';

type RefreshRepoMock = jest.Mocked<
  Pick<RefreshTokensRepository, 'deleteExpiredTokens'>
>;
type EmailVerifRepoMock = jest.Mocked<
  Pick<EmailVerificationRepository, 'deleteExpired'>
>;

describe('TokenCleanupTask', () => {
  let task: TokenCleanupTask;
  let refreshRepo: RefreshRepoMock;
  let emailVerifRepo: EmailVerifRepoMock;

  beforeEach(async () => {
    refreshRepo = {
      deleteExpiredTokens: jest.fn().mockResolvedValue(undefined),
    } as RefreshRepoMock;

    emailVerifRepo = {
      deleteExpired: jest.fn().mockResolvedValue(undefined),
    } as EmailVerifRepoMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenCleanupTask,
        { provide: RefreshTokensRepository, useValue: refreshRepo },
        { provide: EmailVerificationRepository, useValue: emailVerifRepo },
      ],
    }).compile();

    task = module.get(TokenCleanupTask);
  });

  it('handleCron deletes expired refresh tokens and expired email verifications', async () => {
    await task.handleCron();
    expect(refreshRepo.deleteExpiredTokens).toHaveBeenCalledTimes(1);
    expect(emailVerifRepo.deleteExpired).toHaveBeenCalledTimes(1);
  });
});
