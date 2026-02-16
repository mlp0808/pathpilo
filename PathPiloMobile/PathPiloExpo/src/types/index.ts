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

export interface Service {
  id: number;
  service_id: number;
  service_name: string;
  service_description?: string;
  price: number;
  duration_minutes: number;
  is_completed: boolean;
  custom_price?: number;
  custom_duration_minutes?: number;
}

export interface Job {
  id: number;
  title: string;
  scheduled_date: string;
  scheduled_time_from?: string;
  scheduled_time_to?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  client_id: number;
  assigned_user_id: number;
  name?: string; // Client first name
  last_name?: string; // Client last name
  client_email?: string;
  client_phone?: string;
  is_company?: boolean;
  address?: string;
  zip_code?: string;
  city?: string;
  service_count?: number; // Number of tasks
  total_duration?: number; // Estimated duration in minutes
  total_price?: number; // Total price
  services?: Service[]; // Full service details
  completed_tasks?: number;
  total_tasks?: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
