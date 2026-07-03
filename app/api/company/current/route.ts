import { type NextRequest } from 'next/server';
import { resolveAuthContext } from '@/lib/api/middleware';
import { successResponse, errorResponse } from '@/lib/api/response';
import { CompanyService } from '@/services/company/CompanyService';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth.ok) return errorResponse('UNAUTHORIZED', 401);

  const [company, settings, modules] = await Promise.all([
    CompanyService.getCurrent(auth.company.id),
    CompanyService.getSettings(auth.company.id),
    CompanyService.getModules(auth.company.id),
  ]);

  return successResponse({ company, settings, modules });
}
