import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');
const nodemailerMock = nodemailer as jest.Mocked<typeof nodemailer>;

describe('EmailService', () => {
  let service: EmailService;
  const sendMailMock = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    nodemailerMock.createTransport.mockReturnValue({
      sendMail: sendMailMock,
    } as never);

    const module = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => `test-${key}`),
          },
        },
      ],
    }).compile();

    service = module.get(EmailService);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls sendMail with correct to and subject', async () => {
    await service.sendVerificationEmail('user@example.com', 'raw-token-abc');

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Verify your email',
      }),
    );
  });

  it('includes the raw token in both text and html body', async () => {
    await service.sendVerificationEmail('user@example.com', 'raw-token-abc');

    const call = sendMailMock.mock.calls[0][0] as { text: string; html: string };
    expect(call.text).toContain('raw-token-abc');
    expect(call.html).toContain('raw-token-abc');
  });
});
