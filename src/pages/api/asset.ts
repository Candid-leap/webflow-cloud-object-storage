import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request, locals }) => {
  // Get the key from the request
  const url = new URL(request.url);

  // Extract key from URL - handle special characters like & that might be in filenames
  // If the key wasn't properly encoded, URLSearchParams might split it at & characters
  let key = url.searchParams.get("key");

  // Check if the key was split (multiple key params or key seems incomplete)
  const allKeyParams = url.searchParams.getAll("key");
  if (!key || allKeyParams.length > 1 || (url.search.includes("&") && !url.search.endsWith(key))) {
    // Extract manually from the raw search string
    const searchString = url.search.substring(1); // Remove the '?'

    // Find key= and extract everything until the next parameter (starts with & and has =)
    // or until the end of the string
    const keyIndex = searchString.indexOf("key=");
    if (keyIndex !== -1) {
      const afterKey = searchString.substring(keyIndex + 4); // Skip "key="

      // Find the next parameter: look for "&" followed by something that has "="
      // This pattern means a new parameter starts
      const nextParamMatch = afterKey.match(/&([^=]*=)/);
      if (nextParamMatch) {
        // There's another parameter, extract key value up to that point
        const keyValue = afterKey.substring(0, nextParamMatch.index);
        key = decodeURIComponent(keyValue);
      } else {
        // No more parameters, the rest is the key value
        key = decodeURIComponent(afterKey);
      }
    }
  } else if (key) {
    // Key was found, decode it properly
    try {
      key = decodeURIComponent(key);
    } catch (e) {
      // If decode fails, use as-is (might already be decoded)
    }
  }

  if (!key) {
    return new Response("Missing key", { status: 400 });
  }

  // Get the object from the bucket
  const bucket = locals.runtime.env.CLOUD_FILES;
  const object = await bucket.get(key as string);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  // Get the data from the object and return it
  const data = await object.arrayBuffer();
  const contentType = object.httpMetadata?.contentType ?? "";

  return new Response(data, {
    headers: {
      "Content-Type": contentType,
    },
  });
};
