const crypto = require("crypto");

function key() {
  const k = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || "", "base64");
  if (k.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY ausente ou não tem 32 bytes (base64)");
  }
  return k;
}

// formato: base64(iv[12] | authTag[16] | ciphertext)
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

function decrypt(payload) {
  const buf = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
