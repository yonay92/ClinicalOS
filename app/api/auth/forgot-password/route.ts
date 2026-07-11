import { type NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { z } from 'zod';
import { AuthService } from '@/services/auth/AuthService';
import { logger } from '@/lib/logger';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('VALIDATION_ERROR', 400, { message: 'Invalid JSON body' });

  const validated = forgotPasswordSchema.safeParse(body);
  if (!validated.success) {
    return errorResponse('VALIDATION_ERROR', 400, { issues: validated.error.issues });
  }

  try {
    await AuthService.sendPasswordReset(validated.data.email);
  } catch (error) {
    logger.error('POST /api/auth/forgot-password failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Always return success to prevent email enumeration
  }

  return successResponse(null, 'If an account exists with this email, a reset link has been sent.');
}
