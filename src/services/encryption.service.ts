import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const ALGORITHM = "aes-256-gcm";

const SECRET = process.env.ENCRYPTION_SECRET;

if (!SECRET) {
  throw new Error(
    "ENCRYPTION_SECRET missing in environment"
  );
}

const SECRET_KEY = crypto
  .createHash("sha256")
  .update(SECRET)
  .digest();

export class EncryptionService {
  /**
   * Encrypt a text string using AES-256-GCM
   * @param text Original text to encrypt
   * @returns Object containing the encrypted content and initialization vector (IV)
   */
  static encrypt(text: string): { encryptedData: string; iv: string } {
    const iv = crypto.randomBytes(12); // 96-bit IV is recommended for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    // Concatenate the encrypted text and the auth tag
    // to keep it simple for database persistence
    return {
      encryptedData: `${encrypted}:${authTag}`,
      iv: iv.toString("hex")
    };
  }

  /**
   * Decrypt a string back to plain text
   * @param encryptedData Hex string with appended auth tag
   * @param iv Hex string initialization vector
   */
  static decrypt(encryptedData: string, iv: string): string {
    const parts = encryptedData.split(":");
    const ciphertext = parts[0];
    const authTag = parts[1];

    if (!ciphertext || !authTag) {
      throw new Error("Invalid encrypted data format. Missing authentication tag.");
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      SECRET_KEY,
      Buffer.from(iv, "hex")
    );

    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}
