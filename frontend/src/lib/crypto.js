// E2EE — Phase 1: P-256 ECDH keypair infrastructure
// Phase 2+ (DM/Channel/Story encryption) builds on top of these helpers.

const DB_NAME = "shiftroster_e2ee";
const DB_VERSION = 1;
const STORE = "keys";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadOrCreate(userId) {
  const privJwk = await dbGet(`priv_${userId}`);
  const pubJwk = await dbGet(`pub_${userId}`);

  if (privJwk && pubJwk) {
    const privateKey = await crypto.subtle.importKey(
      "jwk", privJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true, ["deriveKey", "deriveBits"]
    );
    const publicKey = await crypto.subtle.importKey(
      "jwk", pubJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true, []
    );
    return { privateKey, publicKey, pubJwk, isNew: false };
  }

  const kp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const newPrivJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const newPubJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  await dbPut(`priv_${userId}`, newPrivJwk);
  await dbPut(`pub_${userId}`, newPubJwk);

  return { privateKey: kp.privateKey, publicKey: kp.publicKey, pubJwk: newPubJwk, isNew: true };
}

// Called after login/checkAuth. Generates keypair if missing and publishes public key.
// publishFn(jwkString) should POST the JWK string to the backend.
export async function initCrypto(userId, publishFn) {
  try {
    const { privateKey, publicKey, pubJwk, isNew } = await loadOrCreate(userId);
    if (isNew) {
      await publishFn(JSON.stringify(pubJwk));
    }
    return { privateKey, publicKey };
  } catch (err) {
    console.error("[E2EE] initCrypto failed:", err);
    return null;
  }
}

export async function getPrivateKey(userId) {
  const jwk = await dbGet(`priv_${userId}`);
  if (!jwk) return null;
  return crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true, ["deriveKey", "deriveBits"]
  );
}

export async function getPublicKeyJwk(userId) {
  return dbGet(`pub_${userId}`);
}

export async function importPublicKey(jwk) {
  const parsed = typeof jwk === "string" ? JSON.parse(jwk) : jwk;
  return crypto.subtle.importKey(
    "jwk", parsed,
    { name: "ECDH", namedCurve: "P-256" },
    true, []
  );
}

// Derive shared AES-256-GCM key via ECDH
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// AES-256-GCM helpers (used by Phase 2+)
export async function aesEncrypt(aesKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  const out = new Uint8Array(12 + buf.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(buf), 12);
  return btoa(String.fromCharCode(...out));
}

export async function aesDecrypt(aesKey, b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    aesKey,
    bytes.slice(12)
  );
  return new TextDecoder().decode(plain);
}

// Phase 3/4: Per-channel / per-story AES-256 key management

export async function generateChannelKey() {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return { key, raw: btoa(String.fromCharCode(...new Uint8Array(raw))) };
}

export async function importChannelKey(rawB64) {
  const bytes = Uint8Array.from(atob(rawB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ECIES wrap: encrypt channelKeyRaw (b64 string) for a member's public key.
// Returns {wrapped: b64, eph_pub: jwk_string} — store both per member.
export async function wrapKeyForMember(channelKeyRaw, memberPubKeyJwk) {
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
  );
  const memberPub = await importPublicKey(memberPubKeyJwk);
  const wrapKey = await deriveSharedKey(eph.privateKey, memberPub);
  const wrapped = await aesEncrypt(wrapKey, channelKeyRaw);
  const ephPubJwk = await crypto.subtle.exportKey("jwk", eph.publicKey);
  return { wrapped, eph_pub: JSON.stringify(ephPubJwk) };
}

// ECIES unwrap: recover channelKeyRaw (b64 string) using own private key + stored eph_pub.
export async function unwrapKeyFromMember(wrapped, ephPubJwkStr, myPrivKey) {
  const ephPub = await importPublicKey(ephPubJwkStr);
  const wrapKey = await deriveSharedKey(myPrivKey, ephPub);
  return aesDecrypt(wrapKey, wrapped);
}

// Mnemonic (used by SettingsPage recovery flow)
const WORD_LIST = ["alpha","bravo","charlie","delta","echo","foxtrot","golf","hotel","india","juliet","kilo","lima","mike","november","oscar","papa","quebec","romeo","sierra","tango","uniform","victor","whiskey","xray","yankee","zulu"];
export function generateMnemonic() {
  const indices = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(indices).map((i) => WORD_LIST[i % WORD_LIST.length]).join(" ");
}

// Phase 2: DM encrypt/decrypt using ECDH-derived shared key
export async function encryptDM(myPrivKey, theirPubKeyJwk, plaintext) {
  const theirPub = await importPublicKey(theirPubKeyJwk);
  const shared = await deriveSharedKey(myPrivKey, theirPub);
  return aesEncrypt(shared, plaintext);
}

export async function decryptDM(myPrivKey, theirPubKeyJwk, ciphertext) {
  const theirPub = await importPublicKey(theirPubKeyJwk);
  const shared = await deriveSharedKey(myPrivKey, theirPub);
  return aesDecrypt(shared, ciphertext);
}
