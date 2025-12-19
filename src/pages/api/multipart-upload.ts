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
  // Set the origin for the API - use ORIGIN from env for CORS
  API.init((locals.runtime as any).env.ORIGIN);

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

      case "get-upload-url": {
        // Generate presigned URL for direct R2 upload (bypasses reverse proxy)
        // This is a workaround for reverse proxy size limits
        const parsedData = await parseRequestData(request);
        const uploadId = parsedData.uploadId as string;
        const key = parsedData.key as string;
        const partNumber = parsedData.partNumber as number;

        if (!uploadId || !key || !partNumber) {
          return API.error("Missing uploadId, key, or partNumber", request, 400);
        }

        try {
          const multipartUpload = bucket.resumeMultipartUpload(key, uploadId);
          // Note: R2 doesn't support presigned URLs for multipart parts
          // So we'll need to proxy through our backend
          // For now, return the upload endpoint URL
          return API.success(
            {
              success: true,
              uploadUrl: request.url.split('?')[0] + `?action=upload-part&uploadId=${encodeURIComponent(uploadId)}&key=${encodeURIComponent(key)}&partNumber=${partNumber}`,
            },
            request
          );
        } catch (error) {
          console.error("Failed to get upload URL:", error);
          return API.error("Failed to get upload URL", request, 500);
        }
      }

      case "upload-part": {
        // Handle upload-part via POST (for long keys that exceed URL size limit)
        return handleUploadPart(request, locals);
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
// Supports both PUT (with params in URL) and POST (with params in body) to handle long keys
export const PUT: APIRoute = async ({ request, locals }) => {
  return handleUploadPart(request, locals);
};

// Shared handler for uploading parts (used by both PUT and POST)
async function handleUploadPart(request: Request, locals: any) {
  // Set the origin for the API - use ORIGIN from env for CORS
  API.init((locals.runtime as any).env.ORIGIN);

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

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action !== "upload-part") {
      return API.error(`Unknown action: ${action}`, request, 400);
    }

    let uploadId: string | null;
    let partNumberStr: string | null;
    let key: string | null;

    // Try to get params from URL first (for PUT requests)
    uploadId = url.searchParams.get("uploadId");
    partNumberStr = url.searchParams.get("partNumber");
    key = url.searchParams.get("key");

    // If not in URL, try to get from request body (for POST requests with long keys)
    if (!uploadId || !partNumberStr || !key) {
      try {
        const contentType = request.headers.get("content-type") || "";
        // Check if body contains JSON metadata (multipart/form-data or JSON)
        if (contentType.includes("application/json")) {
          // For JSON, we need to handle it differently - the body contains both metadata and file data
          // This is complex, so for now we'll require URL params
          // But we can support multipart/form-data
        } else if (contentType.includes("multipart/form-data")) {
          // For multipart, metadata might be in form data
          const formData = await request.formData();
          uploadId = uploadId || (formData.get("uploadId") as string | null);
          partNumberStr = partNumberStr || (formData.get("partNumber") as string | null);
          key = key || (formData.get("key") as string | null);
        }
      } catch (e) {
        // If we can't parse body, continue with URL params only
        console.log("Could not parse body for metadata, using URL params only");
      }
    }

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
}

// Aborts a multipart upload
export const DELETE: APIRoute = async ({ request, locals }) => {
  // Set the origin for the API - use ORIGIN from env for CORS
  API.init((locals.runtime as any).env.ORIGIN);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    console.log("CORS preflight request from:", request.headers.get("Origin"));
    return API.cors(request);
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
  // Set the origin for the API - use ORIGIN from env for CORS
  API.init((locals.runtime as any).env.ORIGIN);
  return API.cors(request);
};
