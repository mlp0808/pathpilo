// Where the phone app talks to your server.
// For a Play Store build, EAS uses production URLs (see eas.json).
// For testing on your phone at home, copy .env.example to .env and use your PC's IP.

const trim = (s: string | undefined) => String(s ?? '').trim();

export const API_CONFIG = {
  BASE_URL:
    trim(process.env.EXPO_PUBLIC_API_URL) || 'https://app.pathpilo.com/api',
  WEB_BASE_URL:
    trim(process.env.EXPO_PUBLIC_WEB_URL) || 'https://app.pathpilo.com',
  TIMEOUT: 10000,
};

export const API_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  COMPANIES: '/companies',
  CLIENTS: '/clients',
  JOBS: '/jobs',
  SERVICES: '/services',
  SUBSCRIPTIONS: '/subscriptions',
} as const;
