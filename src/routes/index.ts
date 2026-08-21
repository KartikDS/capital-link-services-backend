import { Router } from 'express';
import { adminRoutes } from '../modules/admin/admin.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { contentRoutes } from '../modules/content/content.routes';
import { enquiryRoutes } from '../modules/enquiries/enquiries.routes';
import { lookupRoutes } from '../modules/lookups/lookups.routes';
import { orderRoutes } from '../modules/orders/orders.routes';
import { invoiceRoutes, paymentRoutes } from '../modules/payments/payments.routes';
import { portalRoutes } from '../modules/portal/portal.routes';
import { systemRoutes } from '../modules/system/system.routes';
import { uploadRoutes } from '../modules/system/uploads.routes';

/**
 * Every route this API serves, mounted under `/api`.
 *
 * One file listing all of them, so "what does this API expose?" is answerable by
 * reading thirty lines rather than by searching the tree for `Router()`.
 *
 * **The mount points are not ours to choose.** The website is already built
 * against them — `/api/portal/orders`, `/api/orders/{reference}/comments`,
 * `/api/lookups/countries`, `/api/payments/record` — and its own tests assert on
 * those paths. So these are as fixed as the database schema is, and for the same
 * reason: something on the other side already depends on them.
 */

export const apiRouter = Router();

/**
 * Health, public config and schema diagnostics.
 *
 * Mounted at the root rather than under a prefix, because the website calls
 * `/api/health` and `/api/config/public` directly.
 */
apiRouter.use('/', systemRoutes);

apiRouter.use('/auth', authRoutes);

// Reference data. Public and cacheable — the website reads these with an hour's
// revalidation.
apiRouter.use('/lookups', lookupRoutes);
apiRouter.use('/content', contentRoutes);

// The public intake forms, plus the admin queue at /api/enquiries/admin.
apiRouter.use('/enquiries', enquiryRoutes);

// Lodging, tracking and reading orders. Mixed public and authenticated.
apiRouter.use('/orders', orderRoutes);

// The signed-in client's own records. Every route requires a token.
apiRouter.use('/portal', portalRoutes);

// Payments, including the internal `POST /api/payments/record` that the
// website's Stripe webhook calls.
apiRouter.use('/payments', paymentRoutes);
apiRouter.use('/invoices', invoiceRoutes);

// File handling: the pre-flight check and unassigned uploads.
apiRouter.use('/uploads', uploadRoutes);

// The back office. `requireAdmin` is applied inside, on the router itself.
apiRouter.use('/admin', adminRoutes);
