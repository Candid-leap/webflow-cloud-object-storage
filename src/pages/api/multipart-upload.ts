import type { APIRoute } from "astro";
import { API } from "../../utils/api";
import { isAuthenticated } from "../../utils/auth";

interface MultipartUploadRequest {
  key: string;
  contentType?: string;
}

interface CompleteMultipartRequest {
  uploadId: string;
  key: string;
  parts: R2UploadedPart[];
}

// Helper function to parse JSON
async function parseRequestData(
  request: Request
): Promise<{ [key: string]: any }> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  }

  throw new Error("Content-Type must be application/json");
}

// Creates and completes a new multipart upload session
export const POST: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API - also add ASSETS_PREFIX to allowed origins for CORS
  const env = (locals.runtime as any).env;
  API.init(env.ORIGIN);
  // Add ASSETS_PREFIX to allowed origins if it's a different domain
  if (env.ASSETS_PREFIX) {
    try {
      const assetsUrl = new URL(env.ASSETS_PREFIX);
      API.addOrigin(assetsUrl.origin);
    } catch (e) {
      // If ASSETS_PREFIX is not a full URL, ignore
    }
  }

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return API.cors(request);
  }

  // Check authentication
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

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return API.error("Missing action parameter", request, 400);
    }

    switch (action) {
      case "create": {
        // Create a new multipart upload
        const parsedData = await parseRequestData(request);
        const body: MultipartUploadRequest = {
          key: parsedData.key as string,
          contentType: parsedData.contentType as string | undefined,
        };

        if (!body.key) {
          return API.error("Missing key parameter", request, 400);
        }

        try {
          const multipartUpload = await bucket.createMultipartUpload(body.key, {
            httpMetadata: body.contentType
              ? {
                  contentType: body.contentType,
                }
              : undefined,
          });

          return API.success(
            {
              success: true,
              key: multipartUpload.key,
              uploadId: multipartUpload.uploadId,
            },
            request
          );
        } catch (error) {
          console.error("Failed to create multipart upload:", error);
          return API.error("Failed to create multipart upload", request, 500);
        }
      }

      case "complete": {
        // Complete a multipart upload
        const parsedData = await parseRequestData(request);
        const body: CompleteMultipartRequest = {
          uploadId: parsedData.uploadId as string,
          key: parsedData.key as string,
          parts: parsedData.parts as R2UploadedPart[],
        };

        if (!body.uploadId || !body.key || !body.parts) {
          return API.error("Missing required parameters", request, 400);
        }

        try {
          const multipartUpload = bucket.resumeMultipartUpload(
            body.key,
            body.uploadId
          );

          // Parts are already in R2UploadedPart format
          const r2Parts = body.parts;

          const object = await multipartUpload.complete(r2Parts);

          return API.success(
            {
              success: true,
              key: object.key,
              etag: object.httpEtag,
              size: object.size,
            },
            request
          );
        } catch (error: any) {
          console.error("Failed to complete multipart upload:", error);
          return API.error(
            error.message || "Failed to complete multipart upload",
            request,
            400
          );
        }
      }

      default:
        return API.error(`Unknown action: ${action}`, request, 400);
    }
  } catch (error) {
    console.error("Multipart upload error:", error);
    return API.error("Multipart upload failed", request, 500);
  }
};

// Uploads individual parts of a multipart upload
export const PUT: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API - also add ASSETS_PREFIX to allowed origins for CORS
  const env = (locals.runtime as any).env;
  API.init(env.ORIGIN);
  // Add ASSETS_PREFIX to allowed origins if it's a different domain
  if (env.ASSETS_PREFIX) {
    try {
      const assetsUrl = new URL(env.ASSETS_PREFIX);
      API.addOrigin(assetsUrl.origin);
    } catch (e) {
      // If ASSETS_PREFIX is not a full URL, ignore
    }
  }

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return API.cors(request);
  }

  // Check authentication
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

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action !== "upload-part") {
      return API.error(`Unknown action: ${action}`, request, 400);
    }

    const uploadId = url.searchParams.get("uploadId");
    const partNumberStr = url.searchParams.get("partNumber");
    const key = url.searchParams.get("key");

    if (!uploadId || !partNumberStr || !key) {
      return API.error("Missing uploadId, partNumber, or key", request, 400);
    }

    const partNumber = parseInt(partNumberStr);
    if (isNaN(partNumber) || partNumber < 1) {
      return API.error("Invalid part number", request, 400);
    }

    if (!request.body) {
      return API.error("Missing request body", request, 400);
    }

    try {
      const multipartUpload = bucket.resumeMultipartUpload(key, uploadId);

      // Convert request body to ArrayBuffer to get known length
      const arrayBuffer = await request.arrayBuffer();
      const uploadedPart = await multipartUpload.uploadPart(
        partNumber,
        arrayBuffer
      );

      return API.success(
        {
          success: true,
          partNumber: uploadedPart.partNumber,
          etag: uploadedPart.etag,
        },
        request
      );
    } catch (error: any) {
      console.error("Failed to upload part:", error);
      return API.error(error.message || "Failed to upload part", request, 400);
    }
  } catch (error) {
    console.error("Upload part error:", error);
    return API.error("Upload part failed", request, 500);
  }
};

// Aborts a multipart upload
export const DELETE: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API
  API.init((locals.runtime as any).env.ORIGIN);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
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

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action !== "abort") {
      return API.error(`Unknown action: ${action}`, request, 400);
    }

    const uploadId = url.searchParams.get("uploadId");
    const key = url.searchParams.get("key");

    if (!uploadId || !key) {
      return API.error("Missing uploadId or key", request, 400);
    }

    try {
      const multipartUpload = bucket.resumeMultipartUpload(key, uploadId);
      await multipartUpload.abort();

      return API.success(
        {
          success: true,
          message: "Multipart upload aborted successfully",
        },
        request
      );
    } catch (error: any) {
      console.error("Failed to abort multipart upload:", error);
      return API.error(
        error.message || "Failed to abort multipart upload",
        request,
        400
      );
    }
  } catch (error) {
    console.error("Abort multipart upload error:", error);
    return API.error("Abort multipart upload failed", request, 500);
  }
};

export const OPTIONS: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API
  API.init((locals.runtime as any).env.ORIGIN);
  return API.cors(request);
};
