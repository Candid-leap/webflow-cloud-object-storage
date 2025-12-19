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
  API.init((locals.runtime as any).env.ORIGIN);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return API.cors(request);
  }

  try {
    const env = (locals.runtime as any).env;
    
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

