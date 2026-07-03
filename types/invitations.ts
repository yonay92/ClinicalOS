export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type UserInvitation = {
  id: string;
  company_id: string;
  email: string;
  invited_by: string;
  roles: string[];
  sites: string[];
  token: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  status: InvitationStatus;
  revoked_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SendInvitationInput = {
  email: string;
  role_ids: string[];
  site_ids: string[];
};

export type AcceptInvitationInput = {
  token: string;
  full_name: string;
  password: string;
};

export type ValidateTokenResponse = {
  valid: boolean;
  email?: string;
};

export type SendInvitationResponse = {
  invitation_id: string;
  email: string;
  expires_at: string;
};
