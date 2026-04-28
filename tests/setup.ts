// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://localhost:27017/opportunity-platform-test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-must-be-at-least-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-32-chars!';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.PORT = '4000';
process.env.CLIENT_URL = 'http://localhost:4000';
process.env.EMAIL_FROM = 'test@platform.com';
