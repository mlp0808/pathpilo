// API Configuration for PathPilo Mobile App

export const API_CONFIG = {
  BASE_URL: 'http://192.168.1.52:8000/api', // PathPilo API server (use computer IP for mobile)
  // Web (Next.js) origin used for "open on web" deep links (invoice editor,
  // settings pages without a native equivalent, etc.). Port 8000 is the API
  // server; the Next.js dev server lives on 3000. Production should point
  // this at the public app URL (e.g. https://app.pathpilo.com).
  WEB_BASE_URL: 'http://192.168.1.52:3000',
  TIMEOUT: 10000, // 10 seconds
};

export const API_ENDPOINTS = {
  // Authentication
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',

  // User data
  COMPANIES: '/companies',

  // Business data
  CLIENTS: '/clients',
  JOBS: '/jobs',
  SERVICES: '/services',

  // Advanced features
  SUBSCRIPTIONS: '/subscriptions',
} as const;
