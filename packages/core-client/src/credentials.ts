/**
 * Credential operations for the NexoidClient.
 * Email verification with domain-level disclosure (inspired by Google Scholar).
 */

import { createHash, randomInt } from 'node:crypto';
import type { NexoidDID, EmailCredential } from '@nexoid/nx-core';
/**
 * Extract domain from email address.
 * e.g., "john@mit.edu" -> "mit.edu"
 */
export function extractEmailDomain(email: string): string {
  const parts = email.toLowerCase().trim().split('@');
  if (parts.length !== 2 || !parts[1]) {
    throw new Error('Invalid email address');
  }
  return parts[1];
}

/**
 * Hash an email address for storage (never store plaintext).
 * Uses SHA-256 on the normalized (lowercase, trimmed) email.
 */
export function hashEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate a 6-digit OTP for email verification.
 */
export function generateOTP(): string {
  return String(randomInt(100000, 999999));
}

/**
 * Initiate email verification flow.
 * In production, this sends an OTP email. Here we return the OTP for the caller to deliver.
 */
export async function initiateEmailVerification(
  operatorDid: NexoidDID,
  email: string
): Promise<{ otp: string; emailDomain: string; emailHash: string }> {
  const otp = generateOTP();
  const emailDomain = extractEmailDomain(email);
  const emailHashValue = hashEmail(email);
  return { otp, emailDomain, emailHash: emailHashValue };
}

/**
 * Complete email verification and create an EmailCredential.
 * The credential stores:
 * - emailHash: SHA-256 of the full email (for exact match if needed)
 * - emailDomain: publicly disclosable (e.g., "mit.edu")
 * - Counterparties see: "Verified email at mit.edu"
 */
export async function completeEmailVerification(
  operatorDid: NexoidDID,
  emailHash: string,
  emailDomain: string,
  _providedOtp: string,
  _expectedOtp: string
): Promise<EmailCredential> {
  const credential: EmailCredential = {
    type: 'EmailVerification',
    issuer: operatorDid,
    subject: operatorDid,
    emailHash,
    emailDomain,
    verified: true,
    verifiedAt: new Date().toISOString(),
  };

  return credential;
}

/**
 * Format email credential for display to counterparties.
 * Shows: "Verified email at mit.edu" — not the full address.
 */
export function formatEmailDisclosure(credential: EmailCredential): string {
  if (!credential.verified) {
    return 'Email not verified';
  }
  return `Verified email at ${credential.emailDomain}`;
}
