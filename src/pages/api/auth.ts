import type { APIRoute } from 'astro';
import {
  exchangeCodeForToken,
  getWebflowAuthUrl,
  getTokenIntrospect,
  setTokenWithPayload,
  verifySiteAuthorizationFromIntrospect,
} from '../../utils/auth';

export const GET: APIRoute = async ({ request, locals, redirect }) => {
  try {
    console.log('OAuth callback request received', request.url);
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    const env = (locals.runtime as any).env;
    const basePath = import.meta.env.BASE_URL || '';

    // Handle OAuth error from Webflow
    if (error) {
      const errorDescription =
        url.searchParams.get('error_description') || error;
      return redirect(
        `${basePath}/files?error=${encodeURIComponent(errorDescription)}`,
        302
      );
    }

    // If no code, this is the "start auth" request - redirect to Webflow
    if (!code) {
      const authorizationURL = getWebflowAuthUrl(env);
      return redirect(authorizationURL, 302);
    }

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code, env);

    // Introspect token to get authorization info and site IDs
    const authorizationInfo = await getTokenIntrospect(accessToken);

    // Extract site ID from authorization
    const authorizedSiteIds =
      authorizationInfo.authorization?.authorizedTo?.siteIds || [];
    if (authorizedSiteIds.length === 0) {
      throw new Error('No authorized sites found');
    }

    const siteId = authorizedSiteIds[0];

    // Verify site authorization (if WEBFLOW_SITE_ID is configured)
    const isAuthorized = verifySiteAuthorizationFromIntrospect(
      authorizationInfo,
      env
    );
    if (!isAuthorized) {
      // Redirect to unauthorized page without storing token
      return redirect(`${basePath}/unauthorized`, 302);
    }

    // Create JWT with site ID and set cookie
    // Redirect to the base path (index page)
    const response = redirect(
      `${basePath}`,
      302
    );
    
    // Set cookie on the redirect response
    await setTokenWithPayload(response.headers, { site_id: siteId }, env);

    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === 'object' &&
            err !== null &&
            'response' in err
          ? (err as { response?: { data?: { error_description?: string } } })
              .response?.data?.error_description || 'Unknown error'
          : 'Unknown error';
    const basePath = import.meta.env.BASE_URL || '';
    return redirect(
      `${basePath}/files?error=${encodeURIComponent(errorMessage)}`,
      302
    );
  }
};

