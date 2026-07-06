export type SiteStatus = 'active' | 'inactive' | 'closed' | 'archived';

export type Site = {
  id: string;
  company_id: string;
  name: string;
  site_code: string | null;
  principal_investigator: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  timezone: string | null;
  status: SiteStatus;
  created_at: string;
  updated_at: string;
};

export type UserSite = {
  id: string;
  company_id: string;
  user_id: string;
  site_id: string;
  created_at: string;
};

export type CreateSiteInput = {
  name: string;
  site_code?: string;
  principal_investigator?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  timezone?: string;
};

export type UpdateSiteInput = {
  name?: string;
  site_code?: string;
  principal_investigator?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  timezone?: string;
  status?: SiteStatus;
};

export type SiteAssignedStudy = {
  id: string;
  study_id: string;
  study_name: string;
  protocol_number: string | null;
  status: string;
};

export type SiteAssignedUser = {
  id: string;
  full_name: string;
  email: string;
  roles: Array<{ id: string; key: string; name: string }>;
};
