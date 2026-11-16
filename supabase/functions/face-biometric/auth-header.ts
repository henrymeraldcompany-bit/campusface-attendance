export function extractBearerToken(authorization: string): string | null {
  const match = authorization.trim().match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
