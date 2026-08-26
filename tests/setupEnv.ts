/**
 * Environment for the test run.
 *
 * Set before anything imports `config/env`, which validates on load and throws
 * on a missing variable. Without this file every suite would fail at import
 * time rather than at the assertion.
 *
 * The database credentials point nowhere on purpose. The unit suites never
 * connect, and the route suites mock the model layer — so a suite that
 * accidentally issues a real query fails loudly with a connection error instead
 * of quietly reading whatever database the developer happened to have running.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '5099';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_NAME = 'clspubli_test_does_not_exist';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_TIMEZONE = '+10:00';
process.env.DB_READ_ONLY = 'false';
process.env.DB_LOG_QUERIES = 'false';

process.env.JWT_SECRET = 'test-access-secret-that-is-long-enough-32chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.LEGACY_PASSWORD_ALGO = 'auto';
process.env.LEGACY_PASSWORD_REHASH = 'false';

process.env.INTERNAL_API_SECRET = 'test-internal-secret';
process.env.UPLOAD_DIR = './uploads';
process.env.MAX_UPLOAD_MB = '10';
process.env.LOG_LEVEL = 'error';

/**
 * No bucket, so the suite exercises the local storage driver.
 *
 * Empty rather than deleted, and that distinction matters here. `config/env`
 * calls `dotenv.config()` on import, and dotenv fills in any variable that is
 * *absent* from the process environment — so deleting these would hand the suite
 * whatever bucket the developer running it happens to have configured, and a test
 * that wrote a fixture would write it into a real one. An empty string is present,
 * so dotenv leaves it alone, and `nonEmpty` reads it as unset.
 *
 * `tests/unit/documentStorage` is the suite that sets them, and it sets them to
 * empty for the same reason rather than deleting them.
 */
process.env.S3_BUCKET = '';
process.env.S3_REGION = '';
process.env.S3_ACCESS_KEY_ID = '';
process.env.S3_SECRET_ACCESS_KEY = '';
process.env.S3_ENDPOINT = '';
process.env.S3_PREFIX = '';
process.env.S3_FORCE_PATH_STYLE = 'false';
