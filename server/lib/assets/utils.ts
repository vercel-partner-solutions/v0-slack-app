import { createHmac, timingSafeEqual } from "node:crypto";

const ASSET_SIGNING_SECRET = process.env.ASSET_SIGNING_SECRET;
const DEFAULT_EXPIRY_HOURS = 24;

export interface SignedUrlOptions {
  expiryHours?: number;
  chatId?: string;
}

export function generateSignedAssetUrl(
  baseUrl: string,
  slackFileUrl: string,
  options: SignedUrlOptions = {},
): string {
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

  return `${baseUrl}/assets/${encodeURIComponent(slackFileUrl)}?${params.toString()}`;
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
      Buffer.from(expectedSignature, "hex")
    );

  if (!isValidSignature) {
    return { isValid: false, error: "Invalid signature" };
  }

  return {
    isValid: true,
    chatId: chatId || undefined,
  };
}
