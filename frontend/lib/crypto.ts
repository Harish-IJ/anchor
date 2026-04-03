import crypto from 'crypto';

/**
 * AES-256-GCM symmetric encryption for securing 3rd-party tokens
 */

// The encryption key must be exactly 32 bytes (256 bits)
// Loaded from .env.local: ENCRYPTION_KEY (hex, base64, or 32-char string)
const ALGORITHM = 'aes-256-gcm';
const RAW_KEY = process.env.ENCRYPTION_KEY;

if (!RAW_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY environment variable is required in production');
  }
  console.warn('WARNING: Using default encryption key. Set ENCRYPTION_KEY for production.');
}
const EFFECTIVE_KEY = RAW_KEY || 'default_32_character_secret_key!';

// Ensure key is exactly 32 bytes
let ENCRYPTION_KEY_BUFFER: Buffer;
if (Buffer.from(EFFECTIVE_KEY, 'hex').length === 32) {
  ENCRYPTION_KEY_BUFFER = Buffer.from(EFFECTIVE_KEY, 'hex');
} else if (Buffer.from(EFFECTIVE_KEY, 'base64').length === 32) {
  ENCRYPTION_KEY_BUFFER = Buffer.from(EFFECTIVE_KEY, 'base64');
} else {
  // Pad or truncate string to 32 bytes
  ENCRYPTION_KEY_BUFFER = Buffer.alloc(32);
  ENCRYPTION_KEY_BUFFER.write(EFFECTIVE_KEY, 0, 32, 'utf-8');
}

/**
 * Encrypts a plaintext string (e.g. an API token)
 * Returns a composite string: iv:authTag:encryptedData
 */
export function encryptToken(token: string): string {
  if (!token) return token;
  
  // Create a randomized 12-byte initialization vector (standard for GCM)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get the 16-byte authentication tag
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a cipher string created by encryptToken
 */
export function decryptToken(cipherString: string): string {
  if (!cipherString || !cipherString.includes(':')) {
    throw new Error("Invalid format: Not a valid encrypted token");
  }
  
  try {
    const parts = cipherString.split(':');
    if (parts.length !== 3) {
      throw new Error("Invalid format: Missing encryption parts");
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY_BUFFER, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    // If decryption fails (e.g. key rotated/changed), throw so we don't accidentally save corrupted empty tokens later
    throw new Error("Failed to decrypt secure token");
  }
}
