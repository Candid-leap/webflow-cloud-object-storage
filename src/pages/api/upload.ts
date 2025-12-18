import type { APIRoute } from "astro";
import { API } from "../../utils/api";
import { isAuthenticated } from "../../utils/auth";

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

    const formData = await request.formData();
    const file = formData.get("file");
    const customKey = formData.get("key") as string | null;
    const folderPath = (formData.get("folder") as string | null) || "";

    if (!file || !(file instanceof File)) {
      return API.error("Missing or invalid file", request, 400);
    }

    // Normalize folder path (remove leading/trailing slashes, ensure it ends with / if not empty)
    const normalizedFolder = folderPath
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/+/g, "/");
    const folderPrefix = normalizedFolder ? `${normalizedFolder}/` : "";

    // Get file extension from the actual file
    const fileExtension = file.name.split(".").pop() || "";
    const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;

    // Use custom key if provided, otherwise use the file name
    let filename: string;
    if (customKey && customKey.trim()) {
      const customKeyTrimmed = customKey.trim();

      // If custom key already contains a path, use it as-is
      if (customKeyTrimmed.includes("/")) {
        filename = customKeyTrimmed;
      } else {
        // Check if custom key already has an extension
        const customKeyExt = customKeyTrimmed.split(".").pop() || "";
        const hasExtension = customKeyTrimmed.includes(".") &&
          customKeyExt.length > 0 &&
          customKeyExt.length < customKeyTrimmed.length;

        // If no extension in custom key, add the file's extension
        if (!hasExtension && fileExtension) {
          filename = `${folderPrefix}${customKeyTrimmed}.${fileExtension}`;
        } else {
          // Custom key already has extension, use as-is
          filename = `${folderPrefix}${customKeyTrimmed}`;
        }
      }
    } else {
      // Use the file name directly (with folder prefix if in a folder)
      filename = `${folderPrefix}${file.name}`;
    }

    // Upload to R2 bucket (this will replace existing file if key already exists)
    const object = await bucket.put(filename, file, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    if (!object) {
      return API.error("Failed to upload file", request, 500);
    }

    return API.success(
      {
        success: true,
        filename,
        key: object.key,
        size: file.size,
        type: file.type,
      },
      request
    );
  } catch (error) {
    console.error("Upload error:", error);
    return API.error("Upload failed", request, 500);
  }
};
