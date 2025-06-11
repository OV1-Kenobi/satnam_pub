/**
 * Pubky Integration Service
 * 
 * This service handles integration with Pubky homeservers for secure family communication.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib';

interface PubkyHomeserver {
  id: string;
  familyId: string;
  homeserverUrl: string;
  publicKey: string;
  encryptedPrivateKey: string;
}

interface EncryptedFamilyMessage {
  id: string;
  senderNpub: string;
  recipientNpub: string;
  encryptedContent: string;
  pubkySignature: string;
  createdAt: Date;
}

/**
 * Register a new Pubky homeserver for a family
 */
export async function registerPubkyHomeserver(
  familyId: string,
  homeserverUrl: string,
  publicKey: string,
  encryptedPrivateKey: string
): Promise<PubkyHomeserver> {
  // Check if family exists
  const familyExists = await db.query(
    'SELECT id FROM families WHERE id = $1',
    [familyId]
  );

  if (familyExists.rows.length === 0) {
    throw new Error('Family not found');
  }

  // Check if family already has a homeserver
  const existingHomeserver = await db.query(
    'SELECT id FROM pubky_homeservers WHERE family_id = $1',
    [familyId]
  );

  if (existingHomeserver.rows.length > 0) {
    throw new Error('Family already has a registered Pubky homeserver');
  }

  // Register new homeserver
  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO pubky_homeservers (
      id, family_id, homeserver_url, public_key, encrypted_private_key
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id, family_id as "familyId", homeserver_url as "homeserverUrl", 
    public_key as "publicKey", encrypted_private_key as "encryptedPrivateKey"`,
    [id, familyId, homeserverUrl, publicKey, encryptedPrivateKey]
  );

  return result.rows[0];
}

/**
 * Get Pubky homeserver for a family
 */
export async function getPubkyHomeserver(familyId: string): Promise<PubkyHomeserver | null> {
  const result = await db.query(
    `SELECT id, family_id as "familyId", homeserver_url as "homeserverUrl", 
    public_key as "publicKey", encrypted_private_key as "encryptedPrivateKey"
    FROM pubky_homeservers WHERE family_id = $1`,
    [familyId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Update Pubky homeserver information
 */
export async function updatePubkyHomeserver(
  id: string,
  data: { homeserverUrl?: string; publicKey?: string; encryptedPrivateKey?: string }
): Promise<PubkyHomeserver> {
  const { homeserverUrl, publicKey, encryptedPrivateKey } = data;

  // Build update query
  let updateQuery = 'UPDATE pubky_homeservers SET';
  const queryParams: (string)[] = [];
  let paramIndex = 1;
  let needsComma = false;

  if (homeserverUrl) {
    updateQuery += ` homeserver_url = $${paramIndex}`;
    queryParams.push(homeserverUrl);
    paramIndex++;
    needsComma = true;
  }

  if (publicKey) {
    updateQuery += needsComma ? `,` : '';
    updateQuery += ` public_key = $${paramIndex}`;
    queryParams.push(publicKey);
    paramIndex++;
    needsComma = true;
  }

  if (encryptedPrivateKey) {
    updateQuery += needsComma ? `,` : '';
    updateQuery += ` encrypted_private_key = $${paramIndex}`;
    queryParams.push(encryptedPrivateKey);
    paramIndex++;
  }

  updateQuery += ` WHERE id = $${paramIndex} 
    RETURNING id, family_id as "familyId", homeserver_url as "homeserverUrl", 
    public_key as "publicKey", encrypted_private_key as "encryptedPrivateKey"`;
  queryParams.push(id);

  // Execute update
  const result = await db.query(updateQuery, queryParams);

  if (result.rows.length === 0) {
    throw new Error('Pubky homeserver not found');
  }

  return result.rows[0];
}

/**
 * Delete a Pubky homeserver
 */
export async function deletePubkyHomeserver(id: string): Promise<void> {
  const result = await db.query('DELETE FROM pubky_homeservers WHERE id = $1', [id]);

  if (result.rowCount === 0) {
    throw new Error('Pubky homeserver not found');
  }
}

/**
 * Store an encrypted family message
 */
export async function storeEncryptedMessage(
  senderNpub: string,
  recipientNpub: string,
  encryptedContent: string,
  pubkySignature: string
): Promise<EncryptedFamilyMessage> {
  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO encrypted_family_messages (
      id, sender_npub, recipient_npub, encrypted_content, pubky_signature, created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id, sender_npub as "senderNpub", recipient_npub as "recipientNpub", 
    encrypted_content as "encryptedContent", pubky_signature as "pubkySignature", created_at as "createdAt"`,
    [id, senderNpub, recipientNpub, encryptedContent, pubkySignature]
  );

  return result.rows[0];
}

/**
 * Get encrypted messages for a recipient
 */
export async function getEncryptedMessagesForRecipient(
  recipientNpub: string,
  limit = 50,
  offset = 0
): Promise<EncryptedFamilyMessage[]> {
  const result = await db.query(
    `SELECT id, sender_npub as "senderNpub", recipient_npub as "recipientNpub", 
    encrypted_content as "encryptedContent", pubky_signature as "pubkySignature", created_at as "createdAt"
    FROM encrypted_family_messages 
    WHERE recipient_npub = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3`,
    [recipientNpub, limit, offset]
  );

  return result.rows;
}

/**
 * Get encrypted messages sent by a user
 */
export async function getEncryptedMessagesBySender(
  senderNpub: string,
  limit = 50,
  offset = 0
): Promise<EncryptedFamilyMessage[]> {
  const result = await db.query(
    `SELECT id, sender_npub as "senderNpub", recipient_npub as "recipientNpub", 
    encrypted_content as "encryptedContent", pubky_signature as "pubkySignature", created_at as "createdAt"
    FROM encrypted_family_messages 
    WHERE sender_npub = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3`,
    [senderNpub, limit, offset]
  );

  return result.rows;
}

/**
 * Delete an encrypted message
 */
export async function deleteEncryptedMessage(id: string): Promise<void> {
  const result = await db.query('DELETE FROM encrypted_family_messages WHERE id = $1', [id]);

  if (result.rowCount === 0) {
    throw new Error('Encrypted message not found');
  }
}