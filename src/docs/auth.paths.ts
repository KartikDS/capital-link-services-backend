import { body, f, okObject, okRef, operation } from './shared';

/**
 * Sign-in, registration and passwords.
 *
 * Two things worth knowing before reading the endpoints:
 *
 * - **Clients and staff are separate tables** — `tbl_user_client` and
 *   `tbl_user_admin` — with no shared key. A token records which one it came from,
 *   and the admin routes accept only the admin audience.
 * - **Existing passwords may be bcrypt, MD5 or SHA-1.** The schema does not record
 *   which. All are verified on sign-in; anything written is bcrypt.
 */

const tag = 'Authentication';

/**
 * Where a confirmation is actually recorded, said once.
 *
 * Both verify-email operations need it and it is the one thing an integrator
 * cannot guess from the endpoint: there is no `email_verified` column and one
 * cannot be added, so the answer lives in a column the other application owns.
 */
const VERIFY_NOTE =
  '\n\nThere is no `email_verified` column on `tbl_user_client` and the schema is fixed, so a confirmation is recorded by clearing `activation_code` — the same column the Acme application reads to decide whether an account is verified. `SignedInUser.emailVerified` is derived from it.';

export const authPaths = {
  '/api/auth/login': {
    post: operation('/api/auth/login', {
      tag,
      summary: 'Email and password to a session',
      description:
        'Checks `tbl_user_client` then `tbl_user_admin`. Existing bcrypt, MD5 and SHA-1 hashes are all accepted. Every failure returns the same message, so the endpoint cannot be used to discover which addresses are registered.\n\nRate limited on IP **and** email, so a rotating-IP attack cannot work through one account and a shared office connection cannot lock out its colleagues.',
      body: {
        schema: body({ email: f.email(), password: f.string() }, ['email', 'password']),
      },
      responses: {
        200: okRef('Signed in', 'Session'),
        401: { $ref: '#/components/responses/Unauthorized' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    }),
  },

  '/api/auth/refresh': {
    post: operation('/api/auth/refresh', {
      tag,
      summary: 'Rotate the access token',
      description:
        'The account is re-read from the database, so an account disabled since the token was issued cannot refresh.',
      body: {
        schema: body({ refreshToken: f.string() }, ['refreshToken']),
      },
      responses: {
        200: okRef('A new session', 'Session'),
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    }),
  },

  '/api/auth/register': {
    post: operation('/api/auth/register', {
      tag,
      summary: 'Create a client account',
      description:
        'Inserts into `tbl_user_client` and returns a session, so the client can carry on with what they were doing. An account number is generated for `display_id`.\n\n`email` has no unique index and one cannot be added, so the duplicate-email check is not atomic — see the notes in `auth.service.ts`.\n\nThe account is created **unconfirmed**: a code goes into `activation_code` and comes back as `verificationToken` for the caller to email, the same way `forgot-password` hands back a reset token. The session comes back beside it — `user.emailVerified` is false until the link is followed, which is the caller’s cue to ask rather than to bar.',
      body: {
        schema: body(
          {
            firstName: f.string(),
            lastName: f.string(),
            email: f.email(),
            password: f.string('At least eight characters.'),
            phone: f.string(),
            company: f.string(),
            type: {
              type: 'string',
              enum: ['public', 'corporate', 'government'],
              description: 'Defaults to `public`.',
            },
          },
          ['firstName', 'lastName', 'email', 'password']
        ),
      },
      responses: {
        201: okObject('Registered and signed in', {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer' },
          user: { $ref: '#/components/schemas/SignedInUser' },
          verificationToken: {
            type: 'string',
            description:
              'The confirmation code, for the caller to put in the email link. Never rendered anywhere.',
          },
          verificationName: { type: 'string', nullable: true },
        }),
        409: { description: 'That address is already registered' },
        429: { $ref: '#/components/responses/TooManyRequests' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/auth/logout': {
    post: operation('/api/auth/logout', {
      tag,
      summary: 'Discard the session (stateless)',
      description:
        'Stateless, and says so. There is no session table in this schema to delete a row from, so the honest thing is to tell the caller to discard the token rather than to return 200 and imply a revocation that did not happen.\n\nA token stays valid until it expires. Keep the access token lifetime short for that reason.',
      auth: 'bearer',
      errors: {},
      responses: {
        200: okObject('Discard your tokens', {
          message: { type: 'string' },
          stateless: {
            type: 'boolean',
            description: 'Always true. Nothing was revoked server-side.',
          },
        }),
      },
    }),
  },

  '/api/auth/me': {
    get: operation('/api/auth/me', {
      tag,
      summary: 'The signed-in user',
      auth: 'bearer',
      errors: { 401: { $ref: '#/components/responses/Unauthorized' } },
      responses: {
        200: okObject('The user', {
          user: { $ref: '#/components/schemas/SignedInUser' },
        }),
      },
    }),
  },

  '/api/auth/forgot-password': {
    post: operation('/api/auth/forgot-password', {
      tag,
      summary: 'Start a password reset',
      description:
        'Always the same response, whether the address is registered or not. The website sends the email using the token in the response, so a caller cannot tell from the reply whether the address is one CLS holds.\n\nThe reset pin goes in `tbl_user_client.reset_pin`, which is `char(10)` with no expiry column beside it — so the token returned here carries the expiry in its signature. Ten characters is not much entropy, which is why this endpoint is limited to 5 requests per 15 minutes.',
      body: { schema: body({ email: f.email() }, ['email']) },
      responses: {
        200: okObject('Accepted, whether or not the address is known', {
          message: { type: 'string' },
          token: {
            type: 'string',
            nullable: true,
            description:
              'The signed reset token, for the caller to put in the email. Null when the address is not registered.',
          },
        }),
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    }),
  },

  '/api/auth/reset-password': {
    post: operation('/api/auth/reset-password', {
      tag,
      summary: 'Finish a password reset',
      description:
        'Takes the token from `forgot-password` and the new password. The pin in `reset_pin` is cleared on success, so a token cannot be replayed even before it expires.',
      body: {
        schema: body(
          { token: f.string(), password: f.string('At least eight characters.') },
          ['token', 'password']
        ),
      },
      responses: {
        200: okObject('Password changed', { message: { type: 'string' } }),
        410: { description: 'The token expired or has already been used' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/auth/change-password': {
    post: operation('/api/auth/change-password', {
      tag,
      summary: 'Change your own password',
      description:
        'Requires the current password as well as the new one — a stolen access token alone must not be enough to lock the owner out of their account.',
      auth: 'bearer',
      body: {
        schema: body({ currentPassword: f.string(), newPassword: f.string() }, [
          'currentPassword',
          'newPassword',
        ]),
      },
      responses: {
        200: okObject('Password changed', { message: { type: 'string' } }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/auth/verify-email': {
    post: operation('/api/auth/verify-email', {
      tag,
      summary: 'Confirm an email address',
      description:
        'Redeems the code from the confirmation email. `activation_code` is cleared on success, which is what makes a link single-use — so a replay is indistinguishable from a forgery from here, and one message covers both.' +
        VERIFY_NOTE,
      body: { schema: body({ token: f.string() }, ['token']) },
      responses: {
        200: okObject('Confirmed', {
          message: { type: 'string' },
          email: { type: 'string', nullable: true },
          name: { type: 'string', nullable: true },
        }),
        400: { description: 'The code is unknown, or has already been used' },
        429: { $ref: '#/components/responses/TooManyRequests' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/auth/resend-verification': {
    post: operation('/api/auth/resend-verification', {
      tag,
      summary: 'Resend a confirmation link',
      description:
        'Issues a fresh code and returns it for the caller to email. Authenticated rather than keyed on an address, so — unlike `forgot-password` — there is no account to be probed here and no need for a uniform answer to hide one.\n\nThe previous code stops working, so a client who asks twice is not left with two live links and only one that works. An account that is already confirmed gets the same answer with no token: nothing to send is not a failure.',
      auth: 'bearer',
      responses: {
        200: okObject('A link is on its way, if one was needed', {
          message: { type: 'string' },
          verificationToken: {
            type: 'string',
            description:
              'Absent when the address was already confirmed. Never rendered anywhere.',
          },
          email: { type: 'string' },
          name: { type: 'string', nullable: true },
        }),
        429: { $ref: '#/components/responses/TooManyRequests' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/auth/email-available': {
    get: operation('/api/auth/email-available', {
      tag,
      summary: 'Whether an address can be registered',
      description:
        'Called as someone types, so it is rate limited and returns nothing but a boolean — it is an enumeration endpoint by nature, and the limit is what keeps it from being a bulk one.',
      query: [
        {
          name: 'email',
          description: 'The address to check.',
          required: true,
          example: 'someone@example.com',
        },
      ],
      responses: {
        200: okObject('Availability', { available: { type: 'boolean' } }),
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    }),
  },
} as const;

/**
 * `GET /api/auth/verify-email` is registered as well as the POST, and takes the
 * token as a query parameter so the link in the email can be a plain anchor.
 *
 * Declared separately because the two share a path and OpenAPI keys operations by
 * method under one path object — see how they are merged in `index.ts`.
 */
export const authVerifyEmailGet = {
  get: operation('/api/auth/verify-email', {
    tag,
    summary: 'Confirm an email address from the link',
    description:
      'The same redemption as the POST, reachable as a GET so the link can be followed straight from a mail client \u2014 which sends no session and no headers of its own.' +
      VERIFY_NOTE,
    query: [
      {
        name: 'token',
        description: 'The confirmation code from the email.',
        required: true,
      },
    ],
    responses: {
      200: okObject('Confirmed', {
        message: { type: 'string' },
        email: { type: 'string', nullable: true },
        name: { type: 'string', nullable: true },
      }),
      400: { description: 'The code is unknown, or has already been used' },
      429: { $ref: '#/components/responses/TooManyRequests' },
      503: { $ref: '#/components/responses/ReadOnly' },
    },
  }),
} as const;
