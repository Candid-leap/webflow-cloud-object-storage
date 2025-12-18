import type { APIRoute } from 'astro';
import { getWebflowAuthUrl } from '../../../utils/auth';
import { API } from '../../../utils/api';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = (locals.runtime as any).env;
    API.init(env.BASE_URL);

    if (request.method === 'OPTIONS') {
      return API.cors(request);
    }

    console.log('Webflow auth URL request received');

    // Check if required environment variables are set
    if (!env.WEBFLOW_CLIENT_ID) {
      console.error('WEBFLOW_CLIENT_ID is not set');
      return API.error(
        'WEBFLOW_CLIENT_ID environment variable is not configured',
        request,
        500
      );
    }

    if (!env.WEBFLOW_REDIRECT_URI) {
      console.error('WEBFLOW_REDIRECT_URI is not set');
      return API.error(
        'WEBFLOW_REDIRECT_URI environment variable is not configured',
        request,
        500
      );
    }

    const authUrl = getWebflowAuthUrl(env);
    console.log('Generated auth URL successfully');
    return API.success({ authUrl }, request);
  } catch (error) {
    console.error('Error getting Webflow auth URL:', error);
    // Ensure we always return JSON, even on unexpected errors
    try {
      return API.error(
        error instanceof Error ? error.message : 'Failed to get auth URL',
        request,
        500
      );
    } catch (apiError) {
      // Fallback if API.error also fails
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to get auth URL',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }
};

