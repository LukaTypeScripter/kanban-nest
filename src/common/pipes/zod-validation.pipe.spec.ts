import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().positive(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value on valid input', () => {
    const input = { email: 'a@b.com', age: 5 };
    expect(pipe.transform(input)).toEqual(input);
  });

  it('throws BadRequestException on invalid input', () => {
    expect(() => pipe.transform({ email: 'not-email', age: -1 })).toThrow(
      BadRequestException,
    );
  });

  it('returns field-level Zod errors in the exception body', () => {
    try {
      pipe.transform({ email: 'bad', age: -1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as Record<
        string,
        string[]
      >;
      expect(body).toHaveProperty('email');
      expect(body).toHaveProperty('age');
    }
  });
});
