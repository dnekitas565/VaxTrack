import 'dotenv/config';

for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING', 'JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable ${key} (see .env.example)`);
}
if (process.env.JWT_SECRET.length < 16 || process.env.JWT_SECRET.startsWith('change_me')) {
  throw new Error('JWT_SECRET is a placeholder or too short; generate a long random value');
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  db: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  },
};
