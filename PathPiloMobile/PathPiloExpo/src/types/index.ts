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

export type ServiceStatus = 'scheduled' | 'completed' | 'cancelled';

export interface Service {
  id: number;
  service_id: number;
  service_name: string;
  service_description?: string;
  price: number;
  duration_minutes: number;
  is_completed: boolean;
  status?: ServiceStatus;
  completed_at?: string | null;
  custom_price?: number;
  custom_duration_minutes?: number;
}

export type JobStatus =
  | 'scheduled'
  | 'completed'
  | 'sub_completed'
  | 'cancelled';

export interface HandoffMiniJob {
  id: number;
  client_first_name?: string | null;
  client_last_name?: string | null;
  client_type?: 'person' | 'company';
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  scheduled_date?: string | null;
  scheduled_time_from?: string | null;
  scheduled_time_to?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface HandoffResponse {
  current: HandoffMiniJob;
  next: HandoffMiniJob | null;
  drive: {
    duration_seconds: number;
    distance_meters: number;
  } | null;
}

export interface Job {
  id: number;
  title: string;
  scheduled_date: string;
  scheduled_time_from?: string;
  scheduled_time_to?: string;
  status: JobStatus;
  lat?: number | null;
  lng?: number | null;
  route_order?: number | null;
  sort_order?: number | null;
  notes?: string | null;
  /** DB column is often `note`; mobile may receive either shape */
  note?: string | null;
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
  service_count?: number; // Number of completed tasks (not all)
  all_service_count?: number; // Total number of tasks regardless of status
  total_duration?: number; // Duration of completed services only, in minutes
  estimated_duration?: number; // Duration of all services regardless of status, in minutes
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
