import crypto from "crypto";
import ApiError from "./apiError.js";

const deriveAesKey = (secret) => crypto.createHash("sha256").update(secret).digest();

export const encryptSecret = ({ value, key }) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveAesKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptSecret = ({ encryptedValue, key }) => {
  const [ivValue, tagValue, cipherValue] = String(encryptedValue || "").split(":");

  if (!ivValue || !tagValue || !cipherValue) {
    throw new ApiError(500, "Stored encrypted secret is invalid");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveAesKey(key), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));

  return Buffer.concat([decipher.update(Buffer.from(cipherValue, "base64")), decipher.final()]).toString("utf8");
};

export const createSha256HmacSignature = ({ secret, value }) =>
  `sha256=${crypto.createHmac("sha256", secret).update(value || "").digest("hex")}`;

export const timingSafeEqualString = (expected, received) => {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received || "");

  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};
