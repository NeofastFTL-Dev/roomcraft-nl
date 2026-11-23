import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = required('JWT_SECRET', nodeEnv === 'production' ? undefined : 'roomcraft-development-secret');
if (nodeEnv === 'production' && jwtSecret === 'roomcraft-development-secret') {
  throw new Error('JWT_SECRET must be set to a unique value in production.');
}

const configuredPort = Number(process.env.PORT);

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  /** The desktop launcher is single-user and has no login or registration. */
  desktopMode: process.env.DESKTOP_MODE === '1',
  port: Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 4000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  /** HTTPS-only cookies in production, unless a local HTTP deployment opts out. */
  cookieSecure:
    process.env.COOKIE_SECURE === 'false'
      ? false
      : process.env.COOKIE_SECURE === 'true'
        ? true
        : nodeEnv === 'production',
  cookieName: process.env.SESSION_COOKIE_NAME ?? 'roomcraft_session',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  sessionDays: 7,
};

export const RETAILER_ENV: Record<string, { feedUrl: string; apiKey: string }> = {
  ikea_nl: { feedUrl: 'IKEA_NL_FEED_URL', apiKey: 'IKEA_NL_API_KEY' },
  leenbakker: { feedUrl: 'LEENBAKKER_FEED_URL', apiKey: 'LEENBAKKER_API_KEY' },
  kwantum: { feedUrl: 'KWANTUM_FEED_URL', apiKey: 'KWANTUM_API_KEY' },
  praxis: { feedUrl: 'PRAXIS_FEED_URL', apiKey: 'PRAXIS_API_KEY' },
  goossens: { feedUrl: 'GOOSSENS_FEED_URL', apiKey: 'GOOSSENS_API_KEY' },
};
