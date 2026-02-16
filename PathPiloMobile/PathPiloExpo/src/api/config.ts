// API Configuration for PathPilo Mobile App

export const API_CONFIG = {
  BASE_URL: 'http://192.168.1.52:8000/api', // PathPilo API server (use computer IP for mobile)
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
