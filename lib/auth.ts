// lib/auth.ts
import { NextRequest } from 'next/server';
import { verify,sign } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}
export interface AuthUser {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export async function verifyAuth(request: NextRequest): Promise<AuthUser> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = verify(token, JWT_SECRET!) as AuthUser;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function createAuthToken(userId: string, email: string): string {
  const token = sign(
    { userId, email },
    JWT_SECRET!,
    { expiresIn: '7d' }
  );
  return token;
}