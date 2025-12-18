import type { APIRoute } from 'astro';
import { clearAccessToken } from '../../../utils/auth';
import { API } from '../../../utils/api';

export const POST: APIRoute = async ({ request, locals }) => {
  API.init((locals.runtime as any).env.ORIGIN);

  if (request.method === 'OPTIONS') {
    return API.cors(request);
  }

  try {
    const response = API.success(
      { message: 'Logged out successfully' },
      request
    );
    clearAccessToken(response.headers);
    return response;
  } catch (error) {
    return API.error(
      error instanceof Error ? error.message : 'Failed to logout',
      request,
      500
    );
  }
};

