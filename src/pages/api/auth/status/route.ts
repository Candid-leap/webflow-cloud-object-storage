import type { APIRoute } from 'astro';
import { getAccessTokenFromRequest } from '../../../../utils/auth';
import { API } from '../../../../utils/api';

export const GET: APIRoute = async ({ request, locals }) => {
  API.init((locals.runtime as any).env.BASE_URL);

  if (request.method === 'OPTIONS') {
    return API.cors(request);
  }

  try {
    const env = (locals.runtime as any).env;
    const token = await getAccessTokenFromRequest(request, env);
    return API.success({ authenticated: token !== null }, request);
  } catch (error) {
    return API.error(
      error instanceof Error ? error.message : 'Failed to check auth status',
      request,
      500
    );
  }
};

