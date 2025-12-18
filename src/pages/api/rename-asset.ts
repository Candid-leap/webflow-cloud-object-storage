import type { APIRoute } from "astro";
import { API } from "../../utils/api";
import { isAuthenticated } from "../../utils/auth";

export const POST: APIRoute = async ({ request, locals }) => {
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

    const body = await request.json();
    const { oldKey, newKey } = body;

    if (!oldKey || !newKey) {
      return API.error("Missing oldKey or newKey parameter", request, 400);
    }

    if (oldKey === newKey) {
      return API.error("Old key and new key cannot be the same", request, 400);
    }

    // Get the old object
    const oldObject = await bucket.get(oldKey);
    if (!oldObject) {
      return API.error("File not found", request, 404);
    }

    // Check if new key already exists
    const existingObject = await bucket.get(newKey);
    if (existingObject) {
      return API.error("A file with the new name already exists", request, 409);
    }

    // Copy the object to the new key
    const data = await oldObject.arrayBuffer();
    const contentType = oldObject.httpMetadata?.contentType ?? "";
    const customMetadata = oldObject.customMetadata || {};

    // Put the object with the new key, preserving metadata
    await bucket.put(newKey, data, {
      httpMetadata: {
        contentType,
      },
      customMetadata,
    });

    // Delete the old object
    await bucket.delete(oldKey);

    return API.success(
      {
        success: true,
        message: "File renamed successfully",
        oldKey,
        newKey,
      },
      request
    );
  } catch (error) {
    console.error("Rename error:", error);
    return API.error("Failed to rename file", request, 500);
  }
};

export const OPTIONS: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API
  API.init((locals.runtime as any).env.BASE_URL);
  return API.cors(request);
};

