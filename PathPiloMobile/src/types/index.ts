// Type definitions for PathPilo Mobile App

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  companyId?: number;
  companyName?: string;
}

export interface Company {
  id: number;
  name: string;
  slug: string;
  user_role: string;
  created_at: string;
}

export interface Client {
  id: number;
  name: string;
  last_name: string;
  client_type: 'person' | 'company';
  address?: string;
  zip_code?: string;
  city?: string;
  email?: string;
  phone?: string;
}

export interface TimelineEntry {
  id?: number;
  description?: string;
  message?: string;
  created_at: string;
  user_id?: number;
  action?: string;
}

export interface Job {
  id: number;
  title: string;
  scheduled_date: string;
  scheduled_time_from: string;
  scheduled_time_to: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  client_id: number;
  assigned_user_id: number;
  timeline?: TimelineEntry[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
