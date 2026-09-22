// Runs before every test file: deterministic, offline-safe environment. No real secrets.
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.HTTP_USER_AGENT = "FinanceAppTests/0.0 (automated tests)";
process.env.SEC_USER_AGENT = "FinanceAppTests/0.0 tests@example.invalid";
delete process.env.DATABASE_URL;
delete process.env.FINNHUB_API_KEY;
delete process.env.TWELVE_DATA_API_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.KEYED_PROVIDER_MODE;
