import type { APIRoute } from "astro";
import { API } from "../../utils/api";
import { isAuthenticated } from "../../utils/auth";

export const GET: APIRoute = async ({ locals, request }) => {
  // Set the origin for the API
  API.init((locals.runtime as any).env.BASE_URL);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    console.log("CORS preflight request from:", request.headers.get("Origin"));
    return API.cors(request);
  }

  // Authenticate request
  const env = (locals.runtime as any).env;
  const authenticated = await isAuthenticated(request, env);
  if (!authenticated) {
    return API.error("Unauthorized", request, 401);
  }

  try {
    // Check if bucket is available
    const bucket = locals.runtime.env.CLOUD_FILES;
    if (!bucket) {
      return API.error("Cloud storage not configured", request, 500);
    }

    // Get folder path from query parameter
    const url = new URL(request.url);
    const folderPath = url.searchParams.get("folder") || "";
    const showFolders = url.searchParams.get("showFolders") === "true";

    // Normalize folder path (remove leading/trailing slashes, ensure it ends with / if not empty)
    const normalizedFolder = folderPath
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/+/g, "/");
    const prefix = normalizedFolder ? `${normalizedFolder}/` : "";

    // Configure list options with prefix and delimiter for folder support
    const options: {
      limit: number;
      prefix?: string;
      delimiter?: string;
    } = {
      limit: 1000,
      prefix: prefix || undefined,
      delimiter: showFolders ? "/" : undefined,
    };

    const listed = await bucket.list(options);
    let truncated = listed.truncated;

    // Paging through the files
    // @ts-ignore
    let cursor = truncated ? listed.cursor : undefined;

    while (truncated) {
      const next = await bucket.list({
        ...options,
        cursor: cursor,
      });
      listed.objects.push(...next.objects);
      if (showFolders && next.delimitedPrefixes) {
        listed.delimitedPrefixes.push(...next.delimitedPrefixes);
      }

      truncated = next.truncated;
      // @ts-ignore
      cursor = next.cursor;
    }

    // Return files and folders
    return API.success(
      {
        objects: listed.objects,
        folders: listed.delimitedPrefixes || [],
        currentFolder: normalizedFolder,
      },
      request
    );
  } catch (error) {
    console.error("Error listing assets:", error);
    return API.error("Failed to list assets", request, 500);
  }
};
