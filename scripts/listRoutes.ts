import express, { type Router } from 'express';

/**
 * Every route the API actually serves, enumerated from the routers themselves.
 *
 * ## Why it is done this way
 *
 * The obvious approach — walk `app.router.stack` and read each layer's mount path
 * — does not work on Express 5. It compiles a mount into a closure and keeps no
 * readable copy of the path, so a nested router's prefix is simply not
 * recoverable after the fact. Grepping the route files is the other obvious
 * approach, and it cannot see which prefix a router was mounted at either.
 *
 * So the mounts are recorded *as they happen*: `Router.use` is wrapped before the
 * modules are imported, and every `parent.use(path, child)` is noted. Walking that
 * tree from `apiRouter` gives the full path of every route, and it cannot disagree
 * with what the server does because it is the same call that built the server.
 *
 * **This has to be imported before anything that builds a router.** The wrapper is
 * installed at module load for exactly that reason, and the route modules are
 * required lazily inside `listRoutes` rather than imported at the top.
 *
 * Used by `npm run routes` for a listing, and by `tests/unit/openapi.test.ts` to
 * assert every route is documented.
 */

interface Mount {
  path: string;
  child: Router;
}

/** parent router → the children mounted on it, in registration order. */
const mounts = new Map<Router, Mount[]>();

interface Layer {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
  };
  handle?: unknown;
}

/**
 * Wraps `Router.use` so every mount is recorded.
 *
 * Installed once, at module load, and deliberately not undone: this module is only
 * ever loaded by the listing script and the coverage test, both of which want it
 * for the whole process.
 */
const instrument = (): void => {
  const proto = express.Router as unknown as { prototype: Record<string, unknown> };
  const original = proto.prototype.use as (...args: unknown[]) => unknown;

  if ((original as { instrumented?: boolean }).instrumented) return;

  const wrapped = function (this: Router, ...args: unknown[]) {
    const [first, ...rest] = args;

    if (typeof first === 'string') {
      for (const handler of rest) {
        // A mounted router is a function carrying its own `stack`.
        if (typeof handler === 'function' && 'stack' in handler) {
          const list = mounts.get(this) ?? [];
          list.push({ path: first, child: handler as unknown as Router });
          mounts.set(this, list);
        }
      }
    }

    return original.apply(this, args);
  };

  (wrapped as { instrumented?: boolean }).instrumented = true;
  proto.prototype.use = wrapped;
};

instrument();

export interface RouteEntry {
  method: string;
  path: string;
}

/** The paths registered directly on one router, ignoring anything mounted on it. */
const ownRoutes = (router: Router, prefix: string): RouteEntry[] => {
  const stack = (router as unknown as { stack?: Layer[] }).stack ?? [];
  const found: RouteEntry[] = [];

  for (const layer of stack) {
    if (!layer.route) continue;

    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];

    for (const path of paths) {
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        // Express registers a HEAD alongside every GET, and `_all` is its internal
        // marker. Documenting either would pad the spec for no reader's benefit.
        if (!enabled || method === 'head' || method === '_all') continue;

        const full = `${prefix}${path}`.replace(/\/{2,}/g, '/');

        found.push({
          method: method.toUpperCase(),
          path: full.length > 1 ? full.replace(/\/$/, '') : full,
        });
      }
    }
  }

  return found;
};

const walk = (router: Router, prefix: string): RouteEntry[] => [
  ...ownRoutes(router, prefix),
  ...(mounts.get(router) ?? []).flatMap((mount) =>
    walk(mount.child, `${prefix}${mount.path}`.replace(/\/{2,}/g, '/'))
  ),
];

/**
 * Every route under `/api`, sorted by path then method, deduplicated.
 *
 * The modules are required here rather than imported at the top of the file so the
 * wrapper above is already in place when their routers are built.
 */
export const listRoutes = (): RouteEntry[] => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { apiRouter } = require('../src/routes/index') as { apiRouter: Router };

  const found = walk(apiRouter, '/api');
  const seen = new Set<string>();

  return found
    .filter((entry) => {
      const key = `${entry.method} ${entry.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
};

if (require.main === module) {
  const routes = listRoutes();

  for (const { method, path } of routes) {
    console.log(`${method.padEnd(6)} ${path}`);
  }

  console.log(`\n${routes.length} routes`);
}
