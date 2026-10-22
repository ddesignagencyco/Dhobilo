import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import type { AuthedRequest } from '../../common/auth/auth-user';
import { Public } from '../../common/decorators/public.decorator';
import type { Env } from '../../config/env';
import { AuthResult, AuthService } from './auth.service';
import { AdminLoginDto, RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

export const REFRESH_COOKIE = 'dhoblio_rt';
const BODY_TRANSPORT_HEADER = 'x-token-transport';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookies = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** Send a 6-digit login code by SMS. Limited to 3 per phone per 10 minutes and 10 per IP per hour. */
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body() dto: RequestOtpDto, @Req() req: AuthedRequest) {
    return this.auth.requestOtp(dto, { ...this.context(req), requestId: req.id });
  }

  /** Exchange the SMS code for tokens. Creates the account on first login. */
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.verifyOtp(dto, this.context(req)), req, res);
  }

  /** Rotate the refresh token (cookie, or body for non-browser clients) and get a new access token. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refreshToken;
    try {
      return this.respond(await this.auth.refresh(raw, this.context(req)), req, res);
    } catch (err) {
      this.clearCookie(res);
      throw err;
    }
  }

  /** Revoke this login (all rotations of the refresh token). Always succeeds. */
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refreshToken);
    this.clearCookie(res);
  }

  /** Email + password sign-in for admins. Locks for 15 minutes after 5 failures. */
  @Post('admin/login')
  @HttpCode(200)
  async adminLogin(@Body() dto: AdminLoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    return this.respond(await this.auth.adminLogin(dto, this.context(req)), req, res);
  }

  private context(req: AuthedRequest) {
    return { ip: req.ip, userAgent: req.header('user-agent') };
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.secureCookies, sameSite: 'lax', path: '/api/v1/auth' };
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  /** Access token in the body; refresh token in the httpOnly cookie (also in the body if the client opts in). */
  private respond(result: AuthResult, req: AuthedRequest, res: Response) {
    const { tokens, user, isNewUser } = result;
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.cookieOptions(), expires: tokens.refreshExpiresAt });
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      ...(req.header(BODY_TRANSPORT_HEADER) === 'body' ? { refreshToken: tokens.refreshToken } : {}),
      user,
      isNewUser,
    };
  }
}
