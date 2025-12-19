import type { APIRoute } from 'astro';
import { API } from '../../../utils/api';
import { getAccessTokenFromRequest } from '../../../utils/auth';

/**
 * Get JWT token for cross-domain requests
 * This endpoint allows the frontend to get the JWT token to send in Authorization header
 * when making requests to ASSETS_PREFIX (cosmic.webflow.services) domain
 */
export const GET: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API
  const env = (locals.runtime as any).env;
  API.init(env.ORIGIN);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return API.cors(request);
  }

  try {
    // This endpoint should only be accessed from the main domain (where cookies are set)
    // Not from ASSETS_PREFIX (cosmic.webflow.services) domain
    const requestUrl = new URL(request.url);
    const assetsPrefix = env.ASSETS_PREFIX || '';

    // If ASSETS_PREFIX is set and the request is coming from that domain, reject it
    // The token endpoint should only be called from the main domain (webflow.io or custom domain)
    if (assetsPrefix) {
      try {
        const assetsUrl = new URL(assetsPrefix);
        if (requestUrl.origin === assetsUrl.origin) {
          return API.error("This endpoint should not be accessed from ASSETS_PREFIX domain", request, 400);
        }
      } catch (e) {
        // If ASSETS_PREFIX is not a valid URL, ignore this check
      }
    }
    
    // Check if user is authenticated (has valid JWT cookie)
    const token = await getAccessTokenFromRequest(request, env);
    
    if (!token) {
      return API.error("Not authenticated", request, 401);
    }

    // Get the JWT token from cookie to return it
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
      return API.error("No cookie found", request, 401);
    }

    const cookies = cookieHeader.split(';').map(c => c.trim());
    let jwtToken: string | null = null;
    for (const cookie of cookies) {
      const [key, value] = cookie.split('=');
      if (key === 'webflow_jwt_token') {
        jwtToken = decodeURIComponent(value);
        break;
      }
    }

    if (!jwtToken) {
      return API.error("JWT token not found in cookie", request, 401);
    }

    // Return the token (this will be used in Authorization header for cross-domain requests)
    return API.success(
      {
        token: jwtToken,
      },
      request
    );
  } catch (error) {
    console.error("Error getting auth token:", error);
    return API.error("Failed to get auth token", request, 500);
  }
};

