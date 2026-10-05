import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  userId: string;
  email: string;
  mfaEnabled: boolean;
  emailOtpEnabled: boolean;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return data && user ? user[data] : user;
  },
);
