import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return {
      userId: user.id,
      email: user.email,
      mfaEnabled: user.mfaEnabled,
      emailOtpEnabled: user.emailOtpEnabled,
    };
  }
}
