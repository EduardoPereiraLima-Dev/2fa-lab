import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { MfaService } from '../../mfa/mfa.service';

@Injectable()
export class MfaStrategy extends PassportStrategy(Strategy, 'mfa') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly mfaService: MfaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_MFA_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; mfa: boolean }) {
    if (!payload.mfa) {
      throw new UnauthorizedException('Token MFA inválido');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !this.usersService.hasAnyMfaMethod(user)) {
      throw new UnauthorizedException('Usuário não elegível para MFA');
    }

    return { userId: user.id, email: user.email, mfaEnabled: true };
  }
}
