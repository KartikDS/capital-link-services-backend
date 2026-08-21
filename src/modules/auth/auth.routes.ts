import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, currentUserId } from '../../middleware/authenticate';
import { limits } from '../../middleware/rateLimit';
import { message, ok } from '../../shared/http/responses';
import {
  emailField,
  passwordField,
  phoneField,
  validate,
  validQuery,
} from '../../shared/validation';
import * as service from './auth.service';

/**
 * Authentication and session endpoints.
 *
 * The website's NextAuth provider calls `POST /login` and `POST /refresh`; the
 * rest are reached through its own route handlers, which add the emails. Every
 * response that carries a session uses the same shape, because the website reads
 * one shape for both sign-in and refresh.
 */

export const authRoutes = Router();

const credentialsSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(50),
  lastName: z.string().trim().min(1, 'Enter your last name').max(50),
  email: emailField,
  password: passwordField,
  title: z.string().trim().max(10).optional().nullable(),
  phone: phoneField.optional().nullable(),
  mobile: phoneField.optional().nullable(),
  company: z.string().trim().max(1000).optional().nullable(),
  clientType: z.enum(['public', 'corporate', 'government']).optional().nullable(),
});

/**
 * POST /api/auth/login
 *
 * Rate limited on IP *and* email, so a rotating-IP attack cannot work through
 * one account and a shared office connection cannot lock out its colleagues.
 */
authRoutes.post(
  '/login',
  limits.signIn,
  validate(credentialsSchema),
  async (req: Request, res: Response) => {
    const { email, password } = req.body as z.infer<typeof credentialsSchema>;
    const session = await service.signIn(email, password);

    ok(res, session);
  }
);

/** POST /api/auth/refresh — rotates the access token. */
authRoutes.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string().min(1, 'A refresh token is required') })),
  async (req: Request, res: Response) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const session = await service.refreshSession(refreshToken);

    ok(res, session);
  }
);

/** POST /api/auth/register */
authRoutes.post(
  '/register',
  limits.register,
  validate(registerSchema),
  async (req: Request, res: Response) => {
    const input = req.body as z.infer<typeof registerSchema>;
    const session = await service.register(input);

    res.status(201).json(session);
  }
);

/**
 * POST /api/auth/logout
 *
 * Stateless, and says so. There is no session table in this schema to delete a
 * row from, so the honest thing is to tell the caller to discard the token
 * rather than to return 200 and imply a revocation that did not happen.
 */
authRoutes.post('/logout', authenticate, (_req: Request, res: Response) => {
  message(
    res,
    'Signed out. Discard the tokens on your side — this API holds no server-side session.'
  );
});

/**
 * POST /api/auth/forgot-password
 *
 * Always the same answer. The website sends the email using the token in the
 * response, and a caller cannot tell from the reply whether the address was one
 * CLS holds.
 */
authRoutes.post(
  '/forgot-password',
  limits.passwordReset,
  validate(z.object({ email: emailField })),
  async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };
    const issued = await service.beginPasswordReset(email);

    ok(res, {
      message:
        'If that address is registered with us, a reset link is on its way.',
      // Consumed by the website's route, which sends the email. Never rendered.
      ...(issued
        ? { resetToken: issued.token, email: issued.email, name: issued.name }
        : {}),
    });
  }
);

/**
 * POST /api/auth/reset-password
 *
 * The response names the account, so the website can email its owner that the
 * password changed — the one account event a person has to be told about, because
 * a change they did not make is the only sign they get of a takeover. Consumed by
 * the website's route and never rendered; the caller has just proved possession of
 * a valid single-use token for this account, so it tells them nothing new.
 */
authRoutes.post(
  '/reset-password',
  limits.passwordReset,
  validate(
    z.object({
      token: z.string().min(1, 'That reset link is not valid'),
      password: passwordField,
    })
  ),
  async (req: Request, res: Response) => {
    const { token, password } = req.body as { token: string; password: string };
    const client = await service.completePasswordReset(token, password);

    ok(res, {
      message: 'Your password has been changed. You can sign in with it now.',
      ...(client.email ? { email: client.email, name: client.name } : {}),
    });
  }
);

/** POST /api/auth/change-password — from inside the portal. */
authRoutes.post(
  '/change-password',
  authenticate,
  validate(
    z.object({
      currentPassword: z.string().min(1, 'Enter your current password'),
      newPassword: passwordField,
    })
  ),
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    await service.changePassword(currentUserId(req), currentPassword, newPassword);

    message(res, 'Your password has been changed.');
  }
);

const verifySchema = z.object({
  token: z.string().trim().min(1, 'That confirmation link is not valid'),
});

/** POST and GET /api/auth/verify-email — the link in the welcome email. */
authRoutes.post(
  '/verify-email',
  validate(verifySchema),
  async (req: Request, res: Response) => {
    await service.verifyEmail((req.body as { token: string }).token);
    message(res, 'Thank you — your email address is confirmed.');
  }
);

authRoutes.get(
  '/verify-email',
  validate(verifySchema, 'query'),
  async (req: Request, res: Response) => {
    await service.verifyEmail(validQuery<{ token: string }>(req).token);
    message(res, 'Thank you — your email address is confirmed.');
  }
);

/**
 * GET /api/auth/email-available?email=...
 *
 * Called as someone types, so it is rate limited and returns nothing but a
 * boolean — it is an enumeration endpoint by nature, and the limit is what keeps
 * it from being a bulk one.
 */
authRoutes.get(
  '/email-available',
  limits.availability,
  validate(z.object({ email: emailField }), 'query'),
  async (req: Request, res: Response) => {
    const { email } = validQuery<{ email: string }>(req);
    ok(res, { available: await service.isEmailAvailable(email) });
  }
);

/** GET /api/auth/me — the signed-in user, re-read from the database. */
authRoutes.get('/me', authenticate, async (req: Request, res: Response) => {
  const claims = req.auth;
  if (!claims) return;

  const user = await service.currentUser(claims.sub, claims.aud);
  ok(res, { user });
});
