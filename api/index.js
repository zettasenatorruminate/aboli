export const config = { runtime: "edge" };

const TARGET_DOMAIN = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// Restricted headers that should be removed during proxying
const FORBIDDEN_HEADERS = [
  "host", "connection", "keep-alive", "proxy-authenticate", 
  "proxy-authorization", "te", "trailer", "transfer-encoding", 
  "upgrade", "forwarded", "x-forwarded-host", 
  "x-forwarded-proto", "x-forwarded-port"
];

/**
 * Sanitizes and prepares headers for the target request
 */
function prepareHeaders(incomingHeaders) {
  const newHeaders = new Headers();
  let detectedIp = null;

  for (const [key, value] of incomingHeaders) {
    const lowKey = key.toLowerCase();

    if (FORBIDDEN_HEADERS.includes(lowKey) || lowKey.startsWith("x-vercel-")) continue;

    // Handle IP passthrough logic
    if (lowKey === "x-real-ip") {
      detectedIp = value;
      continue;
    }
    if (lowKey === "x-forwarded-for") {
      detectedIp = detectedIp || value;
      continue;
    }

    newHeaders.set(key, value);
  }

  if (detectedIp) newHeaders.set("x-forwarded-for", detectedIp);
  return newHeaders;
}

export default async function handler(req) {
  if (!TARGET_DOMAIN) {
    return new Response("Configuration Error: TARGET_DOMAIN is missing", { status: 500 });
  }

  try {
    // Resolve the full target destination URL
    const url = new URL(req.url);
    const targetUrl = `${TARGET_DOMAIN}${url.pathname}${url.search}`;

    const headers = prepareHeaders(req.headers);
    const { method, body } = req;
    
    // Check if the request should include a body
    const isPayloadMethod = !["GET", "HEAD"].includes(method);

    return await fetch(targetUrl, {
      method,
      headers,
      body: isPayloadMethod ? body : undefined,
      duplex: "half",
      redirect: "manual",
    });

  } catch (err) {
    console.error("Proxy Relay Exception:", err);
    return new Response("Gateway Error: Connection Failed", { status: 502 });
  }
}