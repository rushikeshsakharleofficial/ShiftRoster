# Chat Encryption, Media, and Purging Implementation Plan (2026-04-17)

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement End-to-End Encryption (E2EE) for messages and files, a robust admin-controlled purging policy, user-specific disappearing messages, and rich media support (Emojis and GIFs).

**Architecture:** 
- **Encryption:** Use Asymmetric Encryption (RSA-OAEP 2048-bit or X25519) for key exchange and Symmetric Encryption (AES-256-GCM) for the actual message and file payloads. Encryption/Decryption happens exclusively on the client (browser) using the Web Crypto API.
- **Pruning:** MongoDB TTL indices for automatic expiration and a daily FastAPI background task to enforce the admin's global retention policy.
- **Media:** Integrate `emoji-mart` for the emoji picker and Giphy or Tenor API for GIF search and delivery.

**Tech Stack:** Web Crypto API, MongoDB (TTL), FastAPI (Background Tasks), `emoji-mart`, Giphy/Tenor API.

---

### Task 1: End-to-End Encryption (E2EE) Setup

**Files:**
- Modify: `backend/models/user.py` (Add `public_key` field)
- Modify: `backend/routes/auth.py` (Include public key on registration/login)
- Create: `frontend/src/lib/crypto.js` (Web Crypto wrappers)
- Modify: `frontend/src/pages/ChatPage.js` (Encrypt before send, decrypt after fetch)

**Steps:**
1. Generate RSA key pair on the frontend upon first login if not exists.
2. Store the **Private Key** in IndexedDB (it MUST never leave the client).
3. Push the **Public Key** to the server during user setup.
4. When sending a message:
   - Generate a random symmetric key (AES-GCM).
   - Encrypt the message content with the symmetric key.
   - Encrypt the symmetric key with the recipient's public key (RSA-OAEP).
   - Send the encrypted payload to the server.
5. When receiving:
   - Decrypt the symmetric key using the local private key.
   - Decrypt the message content using the decrypted symmetric key.

### Task 2: Encrypted File Attachments

**Files:**
- Modify: `frontend/src/lib/crypto.js` (Add `encryptFile` and `decryptFile` fns)
- Modify: `frontend/src/pages/ChatPage.js` (Update file upload handler)

**Steps:**
1. Encrypt file blob before upload using a random AES-256-GCM key.
2. Upload the encrypted blob to the server.
3. Encrypt the file's decryption key and metadata using the recipients' public keys and send as a hidden message part.

### Task 3: Admin Global Purging Policy (Housekeeping)

**Files:**
- Modify: `backend/db.py` (Define TTL indices)
- Modify: `backend/routes/operations.py` (Add configuration endpoints)
- Create: `backend/tasks/purging.py` (Pruning logic)

**Steps:**
1. Add `global_retention_days` to the Organization settings (30, 60, 365, 1825, or 0 for lifetime).
2. Implement a daily background task in FastAPI that queries `messages` where `created_at < (now - global_retention_days)` and deletes them.
3. Update the admin dashboard to allow setting this policy.

### Task 4: User-Specific Disappearing Messages

**Files:**
- Modify: `backend/models/message.py` (Add `expires_at` field)
- Modify: `frontend/src/pages/SettingsPage.js` (Add disappearing timer setting)

**Steps:**
1. Allow users to set a `default_disappearing_timer` (7d, 30d, 90d, 180d, 365d, or Custom).
2. When a message is sent, the backend calculates `expires_at = created_at + user_timer`.
3. Add a MongoDB TTL index on the `expires_at` field for automatic deletion.

### Task 5: Emojis with Recents & Favorites

**Files:**
- Create: `frontend/src/components/chat/EmojiPicker.jsx`
- Modify: `frontend/src/pages/ChatPage.js`

**Steps:**
1. Install `emoji-mart` and `@emoji-mart/data`.
2. Implement a popover picker that tracks `recent` and allows marking `favorites`.
3. Persist these preferences in `localStorage` so they survive browser refreshes.

### Task 6: GIF Integration

**Files:**
- Create: `frontend/src/components/chat/GifPicker.jsx`
- Modify: `frontend/src/pages/ChatPage.js`

**Steps:**
1. Integrate Giphy API or Tenor API.
2. Create a search interface within the chat media menu.
3. Fetch GIFs over the internet and send the URL as a specialized message type.

---

## Questions for User Review

1. **GIF API Preference:** Would you prefer **Giphy** (industry standard) or **Tenor** (often simpler/faster)? I will need an API Key for the chosen service.
2. **Key Recovery:** If a user loses their browser data (IndexedDB), they will lose access to all past encrypted messages. Is this acceptable, or should we implement a "Paper Key" (mnemonic) backup for users?
3. **Admin Visibility:** True E2EE means the Admin *cannot* read messages in the database. Is this the intended design, or should the Admin have a "Compliance Key" to decrypt conversations? (Note: A compliance key lowers the overall security).
4. **Purge Policy:** For the "Custom" purging policy, should it be a free-text input (number of days)?

**Plan complete and saved to `docs/plans/2026-04-17-chat-encryption-purging.md`.**
