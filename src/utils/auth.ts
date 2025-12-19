import { SignJWT, jwtVerify } from 'jose';

const JWT_COOKIE = 'webflow_jwt_token';
const TOKEN_EXPIRY_MINUTES = 60; // Token expires in 60 minutes

interface CustomJWTPayload {
  site_id: string;
  exp?: number;
  iat?: number;
}

interface TokenIntrospectResponse {
  authorization?: {
    id?: string;
    createdOn?: string;
    lastUsed?: string;
    grantType?: string;
    rateLimit?: number;
    scope?: string;
    authorizedTo?: {
      siteIds?: string[];
      workspaceIds?: string[];
      userIds?: string[];
    };
  };
  application?: {
    id?: string;
    description?: string;
    homepage?: string;
    displayName?: string;
  };
  [key: string]: unknown;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  [key: string]: unknown;
}

interface Env {
  JWT_SECRET?: string;
  WEBFLOW_CLIENT_ID?: string;
  WEBFLOW_CLIENT_SECRET?: string;
  WEBFLOW_REDIRECT_URI?: string;
  WEBFLOW_SITE_ID?: string;
}

/**
 * Get JWT secret from environment
 */
function getJWTSecret(env: Env): string {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

/**
 * Get cookie value from request
 */
function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Set cookie in response headers
 */
function setCookie(
  headers: Headers,
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
    path?: string;
  } = {}
): void {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  } else {
    parts.push('Path=/');
  }

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  } else {
    parts.push('SameSite=Lax');
  }

  headers.append('Set-Cookie', parts.join('; '));
}

/**
 * Delete cookie in response headers
 */
function deleteCookie(headers: Headers, name: string): void {
  setCookie(headers, name, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
}

/**
 * Check if request has valid JWT
 * Checks both cookie (for same-domain) and Authorization header (for cross-domain)
 */
export async function getAccessTokenFromRequest(
  request: Request,
  env: Env
): Promise<string | null> {
  try {
    // First try to get token from cookie (same-domain requests)
    let jwtToken = getCookie(request, JWT_COOKIE);

    // If no cookie, try Authorization header (cross-domain requests)
    if (!jwtToken) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        jwtToken = authHeader.substring(7); // Remove 'Bearer ' prefix
      }
    }

    if (!jwtToken) {
      return null;
    }

    // Verify and decode JWT
    const secret = new TextEncoder().encode(getJWTSecret(env));
    const { payload } = await jwtVerify(jwtToken, secret);

    const jwtPayload = payload as unknown as CustomJWTPayload;

    // Check if token is expired (jwtVerify already checks this, but double-check)
    if (jwtPayload.exp && Date.now() >= jwtPayload.exp * 1000) {
      return null;
    }

    // Return a truthy value if JWT is valid
    return jwtPayload.site_id ? 'authenticated' : null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if user is authenticated (has valid JWT)
 */
export async function isAuthenticated(
  request: Request,
  env: Env
): Promise<boolean> {
  try {
    const token = await getAccessTokenFromRequest(request, env);
    return token !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Clear the JWT from cookies
 */
export function clearAccessToken(headers: Headers): void {
  deleteCookie(headers, JWT_COOKIE);
}

/**
 * Verify site authorization from introspect data
 */
export function verifySiteAuthorizationFromIntrospect(
  introspectData: TokenIntrospectResponse,
  env: Env
): boolean {
  const webflowSiteId = env.WEBFLOW_SITE_ID;
  if (!webflowSiteId) {
    console.warn('WEBFLOW_SITE_ID not set, skipping site authorization check');
    return true; // Allow if site ID not configured
  }

  try {
    // Check if authorized site IDs include our site ID
    const authorizedSiteIds =
      introspectData.authorization?.authorizedTo?.siteIds || [];
    const isAuthorized = authorizedSiteIds.includes(webflowSiteId);

    if (!isAuthorized) {
      throw new Error(
        `Token not authorized for site ${webflowSiteId}. Authorized sites: ${JSON.stringify(authorizedSiteIds)}`
      );
    }

    return isAuthorized;
  } catch (error) {
    console.error('Error verifying site authorization:', error);
    return false;
  }
}

/**
 * Introspect token and verify site authorization
 */
export async function verifySiteAuthorization(
  accessToken: string,
  env: Env
): Promise<boolean> {
  try {
    const data = await getTokenIntrospect(accessToken);
    return verifySiteAuthorizationFromIntrospect(data, env);
  } catch (error) {
    console.error('Error verifying site authorization:', error);
    return false;
  }
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  env: Env
): Promise<string> {
  const clientId = env.WEBFLOW_CLIENT_ID;
  const clientSecret = env.WEBFLOW_CLIENT_SECRET;
  const redirectUri = env.WEBFLOW_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Webflow OAuth configuration');
  }

  // Request an access token from Webflow's authorization server
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const response = await fetch(
    `https://api.webflow.com/oauth/access_token?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;

  if (!data.access_token) {
    throw new Error('Access token not found in response');
  }

  return data.access_token;
}

/**
 * Get Webflow OAuth authorization URL
 */
export function getWebflowAuthUrl(env: Env): string {
  const clientId = env.WEBFLOW_CLIENT_ID;
  const redirectUri = env.WEBFLOW_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('Missing Webflow OAuth configuration');
  }

  const scopes = ['authorized_user:read'].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
  });

  return `https://webflow.com/oauth/authorize?${params.toString()}`;
}

/**
 * Introspect token and get authorization info including site IDs
 */
export async function getTokenIntrospect(
  accessToken: string
): Promise<TokenIntrospectResponse> {
  const response = await fetch('https://api.webflow.com/v2/token/introspect', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to introspect token: ${error}`);
  }

  return (await response.json()) as TokenIntrospectResponse;
}

/**
 * Create JWT token with site ID only
 */
export async function createTokenWithPayload(
  payload: { site_id: string },
  env: Env
): Promise<string> {
  const secret = new TextEncoder().encode(getJWTSecret(env));
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_MINUTES * 60;

  const jwt = await new SignJWT({
    site_id: payload.site_id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);

  return jwt;
}

/**
 * Set JWT token in cookie with site ID
 */
export async function setTokenWithPayload(
  headers: Headers,
  payload: { site_id: string },
  env: Env
): Promise<void> {
  // Create JWT with only site_id
  const jwt = await createTokenWithPayload(payload, env);

  // Set JWT cookie
  setCookie(headers, JWT_COOKIE, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: TOKEN_EXPIRY_MINUTES * 60,
    path: '/',
  });
}

