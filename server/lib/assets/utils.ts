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

export function proxySlackUrl(slackFileUrl: string): string {
  const encoded = Buffer.from(slackFileUrl).toString('base64url');
  const secret = process.env.ASSET_SIGNING_SECRET;
  return `${getBaseUrl()}/assets/${encoded}?key=${secret}`;
}

export function getBaseUrl() {
  const {
    VERCEL_URL,
    NGROK_URL,
    NODE_ENV,
    VERCEL_TARGET_ENV,
    VERCEL_PROD_URL,
    VERCEL_ENV,
  } = process.env;

  // Development environment - check multiple indicators
  const isDevelopment =
    VERCEL_TARGET_ENV === "development" ||
    NODE_ENV === "development" ||
    VERCEL_ENV === "development";

  if (isDevelopment) {
    if (!NGROK_URL) {
      throw new Error(
        "NGROK_URL environment variable is required for development environment",
      );
    }
    return NGROK_URL;
  }

  // Preview environment
  if (VERCEL_TARGET_ENV === "preview") {
    if (!VERCEL_URL) {
      throw new Error(
        "VERCEL_URL environment variable is required for preview environment",
      );
    }
    return `https://${VERCEL_URL}`;
  }

  // Production environment
  if (
    VERCEL_TARGET_ENV === "production" ||
    VERCEL_TARGET_ENV === "beta" ||
    VERCEL_ENV === "production"
  ) {
    if (!VERCEL_PROD_URL) {
      throw new Error(
        "VERCEL_PROD_URL environment variable is required for production environment",
      );
    }
    return `https://${VERCEL_PROD_URL}`;
  }

  // Fallback: if no environment is clearly defined, assume development
  // This helps prevent the "Invalid environment" error during sign-out
  if (!VERCEL_TARGET_ENV && !VERCEL_ENV && NODE_ENV !== "production") {
    if (!NGROK_URL) {
      throw new Error(
        "NGROK_URL environment variable is required for development environment",
      );
    }
    return NGROK_URL;
  }

  throw new Error(
    `Invalid environment - VERCEL_TARGET_ENV: ${VERCEL_TARGET_ENV}, VERCEL_ENV: ${VERCEL_ENV}, NODE_ENV: ${NODE_ENV}`,
  );
}
