import { type NextRequest } from 'next/server';
import { successResponse } from '@/lib/api/response';
import { validateTokenSchema } from '@/lib/utils/validation';
import { InvitationService } from '@/services/invitations/InvitationService';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';

  const validated = validateTokenSchema.safeParse({ token });
  if (!validated.success) {
    return successResponse({ valid: false });
  }

  const result = await InvitationService.validateToken(validated.data.token);
  return successResponse(result);
}
