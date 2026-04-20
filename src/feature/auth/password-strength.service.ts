import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEn from '@zxcvbn-ts/language-en';

zxcvbnOptions.setOptions({
  translations: zxcvbnEn.translations,
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommon.dictionary,
    ...zxcvbnEn.dictionary,
  },
});

const MIN_ZXCVBN_SCORE = 3;

export interface PasswordContext {
  email: string;
  name: string;
}

@Injectable()
export class PasswordStrengthService {
  private readonly logger = new Logger(PasswordStrengthService.name);

  constructor(private readonly configService: ConfigService) {}

  async validate(password: string, context: PasswordContext): Promise<void> {
    this.rejectPersonalInfo(password, context);
    this.rejectIfWeak(password, context);

    if (this.isHibpEnabled()) {
      await this.rejectIfBreached(password);
    }
  }

  private rejectPersonalInfo(
    password: string,
    { email, name }: PasswordContext,
  ): void {
    const lowered = password.toLowerCase();
    const emailLocal = email.split('@')[0]?.toLowerCase();

    if (emailLocal && emailLocal.length >= 3 && lowered.includes(emailLocal)) {
      throw new BadRequestException(
        'Password must not contain your email address',
      );
    }

    const nameParts = name
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length >= 3);

    for (const part of nameParts) {
      if (lowered.includes(part)) {
        throw new BadRequestException('Password must not contain your name');
      }
    }
  }

  private rejectIfWeak(
    password: string,
    { email, name }: PasswordContext,
  ): void {
    const userInputs = [email, name, ...email.split('@'), ...name.split(/\s+/)];
    const result = zxcvbn(password, userInputs);

    if (result.score < MIN_ZXCVBN_SCORE) {
      const reason =
        result.feedback.warning ||
        'Password is too weak. Try a longer phrase of unrelated words.';
      throw new BadRequestException(reason);
    }
  }

  private async rejectIfBreached(password: string): Promise<void> {
    const sha1 = createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    let body: string;
    try {
      const res = await fetch(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        { headers: { 'Add-Padding': 'true' } },
      );
      if (!res.ok) {
        this.logger.warn(`HIBP returned status ${res.status}; skipping check`);
        return;
      }
      body = await res.text();
    } catch (err) {
      this.logger.warn(
        `HIBP request failed; skipping check: ${(err as Error).message}`,
      );
      return;
    }

    for (const line of body.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix && Number(countStr) > 0) {
        throw new BadRequestException(
          'This password has appeared in a public data breach. Please choose a different one.',
        );
      }
    }
  }

  private isHibpEnabled(): boolean {
    return (
      this.configService.get<string>('PASSWORD_HIBP_CHECK_ENABLED', 'true') ===
      'true'
    );
  }
}
