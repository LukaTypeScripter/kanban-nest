import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

type CurrentUserPayload = {
  id: number;
  email: string;
  emailVerified: boolean;
};

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserPayload }>();

    return request.user;
  },
);
