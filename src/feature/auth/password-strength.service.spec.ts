import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PasswordStrengthService } from './password-strength.service';

describe('PasswordStrengthService', () => {
  let service: PasswordStrengthService;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let fetchSpy: jest.SpyInstance;

  const ctx = { email: 'alice@example.com', name: 'Alice Smith' };

  const hibpResponse = (body: string): Response =>
    ({ ok: true, text: () => Promise.resolve(body) }) as Response;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('true'),
    } as jest.Mocked<Pick<ConfigService, 'get'>>;

    service = new PasswordStrengthService(
      configService as unknown as ConfigService,
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  describe('personal info', () => {
    it('rejects passwords containing the email local-part', async () => {
      configService.get.mockReturnValue('false');
      await expect(service.validate('myalice-pass-9x!', ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects passwords containing a name fragment (>=3 chars)', async () => {
      configService.get.mockReturnValue('false');
      await expect(service.validate('superSmithPass-9!', ctx)).rejects.toThrow(
        /name/i,
      );
    });

    it('accepts a password unrelated to email/name when HIBP is off', async () => {
      configService.get.mockReturnValue('false');
      await expect(
        service.validate('quiet-harbour-zebra-42', ctx),
      ).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('zxcvbn strength', () => {
    it('rejects all-same-character passwords (low entropy)', async () => {
      configService.get.mockReturnValue('false');
      await expect(service.validate('aaaaaaaaaaaa1', ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects famous weak passwords even when length passes', async () => {
      configService.get.mockReturnValue('false');
      await expect(service.validate('Password123!', ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('runs before HIBP (no network call for weak passwords)', async () => {
      configService.get.mockReturnValue('true');
      await expect(service.validate('Password123!', ctx)).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('HIBP check', () => {
    it('rejects a password whose suffix appears in the HIBP range response', async () => {
      const suffix = createHash('sha1')
        .update('some-real-password-123')
        .digest('hex')
        .toUpperCase()
        .slice(5);

      fetchSpy.mockResolvedValue(hibpResponse(`${suffix}:42\n`));

      await expect(
        service.validate('some-real-password-123', ctx),
      ).rejects.toThrow(/breach/i);
    });

    it('fails open when HIBP returns a non-2xx status', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 503 } as Response);
      await expect(
        service.validate('quiet-harbour-zebra-42', ctx),
      ).resolves.toBeUndefined();
    });

    it('fails open when the HIBP request throws', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));
      await expect(
        service.validate('quiet-harbour-zebra-42', ctx),
      ).resolves.toBeUndefined();
    });

    it('accepts a password whose suffix does not appear in the range response', async () => {
      fetchSpy.mockResolvedValue(
        hibpResponse('0000000000000000000000000000000000A:1\n'),
      );
      await expect(
        service.validate('quiet-harbour-zebra-42', ctx),
      ).resolves.toBeUndefined();
    });
  });
});
