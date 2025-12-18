import type { APIRoute } from "astro";
import { API } from "../../utils/api";
import { isAuthenticated } from "../../utils/auth";

export const DELETE: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API
  API.init((locals.runtime as any).env.BASE_URL);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    console.log("CORS preflight request from:", request.headers.get("Origin"));
    return API.cors(request);
  }

  // Check authentication
  const env = (locals.runtime as any).env;
  const authenticated = await isAuthenticated(request, env);
  if (!authenticated) {
    return API.error("Authentication required", request, 401);
  }

  try {
    // Check if bucket is available
    const bucket = locals.runtime.env.CLOUD_FILES;
    if (!bucket) {
      return API.error("Cloud storage not configured", request, 500);
    }

    // Get the key from the request
    const url = new URL(request.url);

    // Extract key - handle special characters like & that might be in filenames
    let key = url.searchParams.get("key");

    // If key was split at & character, extract manually
    if (!key || url.searchParams.getAll("key").length > 1) {
      const searchString = url.search.substring(1);
      const keyIndex = searchString.indexOf("key=");
      if (keyIndex !== -1) {
        const afterKey = searchString.substring(keyIndex + 4);
        const nextParamMatch = afterKey.match(/&([^=]*=)/);
        if (nextParamMatch) {
          key = decodeURIComponent(afterKey.substring(0, nextParamMatch.index || afterKey.length));
        } else {
          key = decodeURIComponent(afterKey);
        }
      }
    } else if (key) {
      try {
        key = decodeURIComponent(key);
      } catch (e) {
        // Use as-is if decode fails
      }
    }

    if (!key) {
      return API.error("Missing key parameter", request, 400);
    }

    // Delete the object from the bucket
    await bucket.delete(key);

    return API.success(
      {
        success: true,
        message: "File deleted successfully",
        key,
      },
      request
    );
  } catch (error) {
    console.error("Delete error:", error);
    return API.error("Failed to delete file", request, 500);
  }
};

export const OPTIONS: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API
  API.init((locals.runtime as any).env.BASE_URL);
  return API.cors(request);
};

