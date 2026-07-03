export type ProfileStatus = 'active' | 'inactive' | 'pending_invite' | 'suspended';

export type Profile = {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_file_id: string | null;
  status: ProfileStatus;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  legal_name: string | null;
  status: 'active' | 'inactive' | 'suspended' | 'archived';
  subscription_plan: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type CompanySettings = {
  id: string;
  company_id: string;
  logo_file_id: string | null;
  primary_color: string;
  secondary_color: string;
  default_timezone: string;
  date_format: string;
  language: string;
  enable_ai: boolean;
  enable_task_center: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyModule = {
  id: string;
  company_id: string;
  module_key: string;
  is_enabled: boolean;
  created_at: string;
};

export type UpdateProfileInput = {
  full_name?: string;
  phone?: string;
  status?: ProfileStatus;
};

export type UpdateCompanySettingsInput = {
  primary_color?: string;
  secondary_color?: string;
  default_timezone?: string;
  date_format?: string;
  language?: string;
  enable_ai?: boolean;
  enable_task_center?: boolean;
};
