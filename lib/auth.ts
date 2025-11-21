// lib/auth.ts
import { NextRequest } from 'next/server';
import { verify, sign } from 'jsonwebtoken';
import { z } from 'zod';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not defined');
}

export interface AuthUser {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}
const authUserSchema = z.object({
  userId: z.string(),
  email: z.string(),
  iat: z.number(),
  exp: z.number(),
});
export async function verifyAuth(request: NextRequest): Promise<AuthUser> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = verify(token, JWT_SECRET!, { algorithms: ['HS256'] });
    const validated = authUserSchema.parse(decoded);
    return validated;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function createAuthToken(userId: string, email: string): string {
  const token = sign(
    { userId, email },
    JWT_SECRET!,
    { expiresIn: '7d', algorithm: 'HS256' }
  );
  return token;
}