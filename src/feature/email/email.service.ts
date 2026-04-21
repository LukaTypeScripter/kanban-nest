import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      auth: {
        user: config.getOrThrow<string>('SMTP_USER'),
        pass: config.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async sendVerificationEmail(to: string, rawToken: string): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const url = `${appUrl}/api/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

    const info = await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to,
      subject: 'Verify your email',
      text: `Click this link to verify your email (valid for 15 minutes): ${url}`,
      html: `<p>Click <a href="${url}">here</a> to verify your email. This link expires in 15 minutes.</p>`,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) this.logger.log(`Email preview: ${previewUrl}`);
  }
}
