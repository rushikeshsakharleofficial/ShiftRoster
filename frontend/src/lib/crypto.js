/**
 * E2EE Library for ShiftMaster Chat
 * Uses Web Crypto API for client-side encryption.
 */

// --- Constants & Config ---
const RSA_ALGO = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_ALGO = "AES-GCM";

// --- Key Management ---

/**
 * Generates a new RSA-OAEP key pair.
 */
export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    RSA_ALGO,
    true, // extractable
    ["encrypt", "decrypt"]
  );
  return keyPair;
}

/**
 * Exports a key to Base64/SPKI format for storage.
 */
export async function exportPublicKey(key) {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Imports a public key from Base64/SPKI.
 */
export async function importPublicKey(base64Str) {
  const binaryDer = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer,
    RSA_ALGO,
    true,
    ["encrypt"]
  );
}

// --- Encryption / Decryption ---

/**
 * Encrypts a message for a set of recipients.
 * Returns: { ciphertext, encryptedKeys: { userId: encryptedSymmetricKey } }
 */
export async function encryptMessage(text, recipientKeys) {
  // 1. Generate random symmetric key
  const aesKey = await window.crypto.subtle.generateKey(
    { name: AES_ALGO, length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Encrypt text with AES key
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    aesKey,
    encoded
  );

  // 3. Export AES key to wrap it
  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);

  // 4. Encrypt AES key for each recipient
  const encryptedKeys = {};
  for (const [userId, pubKeyStr] of Object.entries(recipientKeys)) {
    try {
      const pubKey = await importPublicKey(pubKeyStr);
      const wrappedKey = await window.crypto.subtle.encrypt(
        RSA_ALGO,
        pubKey,
        rawAesKey
      );
      encryptedKeys[userId] = btoa(String.fromCharCode(...new Uint8Array(wrappedKey)));
    } catch (e) {
      console.error(`Failed to encrypt for user ${userId}:`, e);
    }
  }

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
    encryptedKeys,
  };
}

/**
 * Decrypts a message using local private key.
 */
export async function decryptMessage(payload, privateKey) {
  const { ciphertext, iv, wrappedKey } = payload;
  
  // 1. Unwrap AES key
  const wrappedKeyBuffer = Uint8Array.from(atob(wrappedKey), (c) => c.charCodeAt(0));
  const rawAesKey = await window.crypto.subtle.decrypt(
    RSA_ALGO,
    privateKey,
    wrappedKeyBuffer
  );
  
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawAesKey,
    AES_ALGO,
    true,
    ["decrypt"]
  );

  // 2. Decrypt text
  const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const ciphertextBuffer = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: AES_ALGO, iv: ivBuffer },
    aesKey,
    ciphertextBuffer
  );

  return new TextDecoder().decode(decrypted);
}

// --- Mnemonic (Pseudo-BIP39 for recovery) ---
const WORD_LIST = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray", "yankee", "zulu"];

export function generateMnemonic() {
  const indices = window.crypto.getRandomValues(new Uint32Array(12));
  return Array.from(indices).map(i => WORD_LIST[i % WORD_LIST.length]).join(" ");
}
