import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  JwtPayloadSchema,
  JwtPayloadType,
} from '@feature/auth/schemas/jwt-payload.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayloadType): unknown {
    const result = JwtPayloadSchema.safeParse(payload);

    if (!result.success) throw new UnauthorizedException();

    return { id: payload.sub, email: payload.email };
  }
}
