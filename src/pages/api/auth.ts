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
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    const env = (locals.runtime as any).env;
    // Normalize base path (remove trailing slash if present, except for root)
    // Use import.meta.env.BASE_URL which is set by Astro from astro.config.mjs
    const rawBasePath = import.meta.env.BASE_URL || '';
    const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');

    // Handle OAuth error from Webflow
    if (error) {
      const errorDescription =
        url.searchParams.get('error_description') || error;
      return redirect(
        `${basePath}/login?error=${encodeURIComponent(errorDescription)}`,
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
    // Build redirect URL - use absolute URL with basePath to ensure proper redirect
    // IMPORTANT: Use the ORIGIN from env to ensure we redirect to the correct domain
    // (not cosmic.webflow.services, but the main webflow.io or custom domain)
    const redirectOrigin = env.ORIGIN || url.origin;
    // Include basePath in redirect URL (e.g., /app or empty string)
    const redirectPath = basePath || '/';
    const redirectUrl = `${redirectOrigin}${redirectPath}`;

    console.log('OAuth success - redirecting to:', redirectUrl);
    console.log('Cookie will be set on domain:', redirectOrigin);

    // Create redirect response
    const response = new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
      },
    });
    
    // Set cookie on the redirect response
    // The cookie domain should match the redirect origin
    await setTokenWithPayload(response.headers, { site_id: siteId }, env);

    return response;
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === 'object' &&
            err !== null &&
            'response' in err
          ? (err as { response?: { data?: { error_description?: string } } })
              .response?.data?.error_description || 'Unknown error'
          : 'Unknown error';
    // Normalize base path (remove trailing slash if present, except for root)
    const rawBasePath = import.meta.env.BASE_URL || '';
    const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');
    return redirect(
      `${basePath}/login?error=${encodeURIComponent(errorMessage)}`,
      302
    );
  }
};

