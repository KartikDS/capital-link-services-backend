import { createApp } from './app';
import { env } from './config/env';
import { assertDatabaseConnection, closeDatabase } from './config/database';
import { logger } from './shared/logger';

/**
 * The process. Connects, listens, and shuts down cleanly.
 *
 * The database is checked **before** the port opens. A process that is
 * listening but cannot reach MySQL passes a TCP health check and fails every
 * request, so the load balancer sends it traffic it cannot serve. Failing to
 * start is the more useful outcome.
 */

const start = async (): Promise<void> => {
  try {
    await assertDatabaseConnection();
  } catch (error) {
    logger.error('Could not connect to the database. Not starting.', {
      host: env.database.host,
      database: env.database.name,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info('API listening', {
      port: env.port,
      environment: env.nodeEnv,
      docs: `http://localhost:${env.port}/api-docs`,
      readOnly: env.database.readOnly,
    });

    if (env.database.readOnly) {
      logger.warn(
        'DB_READ_ONLY is on: every write will be refused. Turn it off when the write milestone begins.'
      );
    }

    if (!env.internalApiSecret) {
      logger.warn(
        'INTERNAL_API_SECRET is unset, so POST /api/payments/record is disabled and Stripe payments will not be recorded.'
      );
    }
  });

  /**
   * Stops taking new requests, lets the in-flight ones finish, then closes the
   * pool. Without the timeout a single hung request keeps the process alive
   * past whatever grace period the orchestrator allows, and it gets SIGKILLed
   * mid-write instead.
   */
  const shutdown = (signal: string): void => {
    logger.info('Shutting down', { signal });

    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out with requests still open. Exiting.');
      process.exit(1);
    }, 10_000);

    // Nothing else needs this process alive while it waits.
    forceExit.unref();

    server.close(() => {
      void closeDatabase()
        .then(() => {
          logger.info('Shut down cleanly');
          process.exit(0);
        })
        .catch((error: unknown) => {
          logger.error('Error while closing the database', {
            message: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /**
   * An unhandled rejection is left to crash the process.
   *
   * Logging and carrying on leaves the process in a state nobody reasoned
   * about — a half-applied write, a released connection that is still checked
   * out. A restart is the recoverable outcome.
   */
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    throw reason instanceof Error ? reason : new Error(String(reason));
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { message: error.message, stack: error.stack });
    process.exit(1);
  });
};

void start();
