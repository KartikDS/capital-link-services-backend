import { adminPaths } from './admin.paths';
import { authPaths, authVerifyEmailGet } from './auth.paths';
import { contentPaths } from './content.paths';
import { enquiryPaths } from './enquiries.paths';
import { lookupPaths } from './lookups.paths';
import { orderPaths } from './orders.paths';
import { paymentPaths } from './payments.paths';
import { portalPaths } from './portal.paths';
import { operationId } from './shared';
import { systemPaths } from './system.paths';

export { components } from './components';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * Stamps `operationId` on every operation.
 *
 * Done here rather than inside `operation()` because the method is the key an
 * operation sits under, and an operation cannot see its own key. Doing it in one
 * pass also means no path file can forget it.
 *
 * The ids are what a client generator names its methods, so a stale or duplicated
 * one produces a confusingly-named function rather than an error — which is exactly
 * the kind of thing that goes unnoticed. Deriving them from the path and method
 * makes both impossible.
 */
const stampOperationIds = <T extends Record<string, Record<string, unknown>>>(
  paths: T
): T => {
  for (const [path, operations] of Object.entries(paths)) {
    for (const method of METHODS) {
      const operation = operations[method] as Record<string, unknown> | undefined;

      if (operation) operation.operationId = operationId(method, path);
    }
  }

  return paths;
};

/**
 * Every documented path, assembled.
 *
 * The tag order below is the reading order the docs page shows — public reference
 * data before the journeys, the client's own records before the back office. Swagger
 * UI sorts tags alphabetically for the sidebar, but the underlying document keeps
 * this order for anything that reads the JSON.
 *
 * `/api/auth/verify-email` is spread in separately because it is the one path served
 * by two methods declared in two places: the POST issues a token and the GET
 * confirms one from a link in an email. OpenAPI keys operations by method under a
 * single path object, so the two have to be merged rather than listed twice.
 */
export const paths = stampOperationIds({
  ...systemPaths,
  ...authPaths,
  '/api/auth/verify-email': {
    ...authPaths['/api/auth/verify-email'],
    ...authVerifyEmailGet,
  },
  ...lookupPaths,
  ...contentPaths,
  ...enquiryPaths,
  ...orderPaths,
  ...portalPaths,
  ...paymentPaths,
  ...adminPaths,
});

/**
 * The tags, in the order above.
 *
 * Kept beside the paths rather than in `config/swagger.ts` so a new tag is one edit:
 * a path file, an import, and a line here.
 */
export const tags = [
  { name: 'System', description: 'Health, configuration and schema diagnostics' },
  { name: 'Uploads', description: 'File pre-flight checks and unassigned uploads' },
  { name: 'Authentication', description: 'Sign-in, registration and passwords' },
  {
    name: 'Lookups',
    description: 'Countries, visa types, fees and other reference data',
  },
  { name: 'Content', description: 'Editable page copy from the CMS tables' },
  { name: 'Enquiries', description: 'The public intake forms' },
  { name: 'Orders', description: 'Lodging, tracking and reading orders' },
  { name: 'Portal', description: "The signed-in client's own records" },
  { name: 'Payments', description: 'Recording payments and reading invoices' },
  { name: 'Admin', description: 'Back office. Staff tokens only.' },
] as const;
