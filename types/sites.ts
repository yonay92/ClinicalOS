export type SiteStatus = 'active' | 'inactive' | 'closed';

export type Site = {
  id: string;
  company_id: string;
  name: string;
  site_code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
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
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
};

export type UpdateSiteInput = {
  name?: string;
  site_code?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  status?: SiteStatus;
};
