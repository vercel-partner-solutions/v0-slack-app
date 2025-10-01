import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_EXPIRY_HOURS = 24;

export interface SignedUrlOptions {
  expiryHours?: number;
  chatId?: string;
}

export function generateSignedAssetUrl(
  slackFileUrl: string,
  options: SignedUrlOptions = {},
): string {
  const { ASSET_SIGNING_SECRET } = process.env;
  if (!ASSET_SIGNING_SECRET) {
    throw new Error("ASSET_SIGNING_SECRET environment variable is required");
  }
  const { expiryHours = DEFAULT_EXPIRY_HOURS, chatId } = options;

  // Calculate expiration timestamp
  const expiresAt = Math.floor(Date.now() / 1000) + expiryHours * 60 * 60;

  // Create signature payload
  const payload = [slackFileUrl, expiresAt.toString(), chatId || ""].join(":");

  // Generate HMAC signature
  const signature = createHmac("sha256", ASSET_SIGNING_SECRET)
    .update(payload)
    .digest("hex");

  // Build signed URL
  const params = new URLSearchParams({
    sig: signature,
    exp: expiresAt.toString(),
  });

  if (chatId) {
    params.set("chat", chatId);
  }

  return `${getBaseUrl()}/assets/${encodeURIComponent(slackFileUrl)}?${params.toString()}`;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  chatId?: string;
}

export function validateSignedUrl(
  slackFileUrl: string,
  signature: string,
  expiresAt: string,
  chatId?: string,
): ValidationResult {
  const { ASSET_SIGNING_SECRET } = process.env;
  if (!ASSET_SIGNING_SECRET) {
    throw new Error("ASSET_SIGNING_SECRET environment variable is required");
  }
  // Check if signature and expiry are provided
  if (!signature || !expiresAt) {
    return { isValid: false, error: "Missing signature or expiration" };
  }

  // Check if URL has expired
  const now = Math.floor(Date.now() / 1000);
  const expiry = parseInt(expiresAt, 10);

  if (Number.isNaN(expiry) || now > expiry) {
    return { isValid: false, error: "URL has expired" };
  }

  // Recreate the signature payload
  const payload = [slackFileUrl, expiresAt, chatId || ""].join(":");

  // Generate expected signature
  const expectedSignature = createHmac("sha256", ASSET_SIGNING_SECRET)
    .update(payload)
    .digest("hex");

  // Compare signatures using constant-time comparison to prevent timing attacks
  const isValidSignature =
    signature.length === expectedSignature.length &&
    timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    );

  if (!isValidSignature) {
    return { isValid: false, error: "Invalid signature" };
  }

  return {
    isValid: true,
    chatId: chatId || undefined,
  };
}

export function getBaseUrl() {
  const VERCEL_URL = process.env.VERCEL_URL;
  const NGROK_URL = process.env.NGROK_URL;
  const VERCEL_ENV = process.env.VERCEL_ENV;
  const VERCEL_PROJECT_PRODUCTION_URL =
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (VERCEL_ENV === "development") {
    // This should be set by the dev.tunnel.ts script
    // https://github.com/vercel-partner-solutions/v0-slack-app/blob/05563e401da13dfbca4da97b32f50e455e33bdbf/scripts/dev.tunnel.ts#L165
    if (!NGROK_URL) {
      throw new Error(
        "NGROK_URL environment variable is required for development environment",
      );
    }
    return NGROK_URL;
  } else if (VERCEL_ENV === "preview") {
    if (!VERCEL_URL) {
      throw new Error(
        "VERCEL_URL environment variable is required for preview environment",
      );
    }
    return `https://${VERCEL_URL}`;
  }

  if (!VERCEL_PROJECT_PRODUCTION_URL) {
    throw new Error(
      "VERCEL_PROJECT_PRODUCTION_URL environment variable is required for production environment",
    );
  }

  return `https://${VERCEL_PROJECT_PRODUCTION_URL}`;
}
