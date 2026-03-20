/**
 * EIP-712 Identity Proof — cryptographic proof of agent identity and delegation.
 *
 * An agent signs a typed structured data message containing:
 * - agent: their Ethereum address
 * - delegationId: on-chain delegation ID proving authorization
 * - nonce: random bytes to prevent replay
 * - timestamp: proof generation time
 * - verifier: intended recipient address (binds proof to verifier)
 *
 * Any party can verify the proof by recovering the signer address from the
 * EIP-712 signature and checking it matches the agent field.
 */

import { verifyTypedData } from 'viem';

// EIP-712 Domain separator
export interface IdentityProofDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

// The proof struct
export interface IdentityProof {
  agent: `0x${string}`;
  delegationId: bigint;
  nonce: `0x${string}`;
  timestamp: bigint;
  verifier: `0x${string}`;
}

// Signed proof output
export interface SignedIdentityProof {
  proof: IdentityProof;
  signature: `0x${string}`;
  domain: IdentityProofDomain;
}

// EIP-712 type definitions
export const IDENTITY_PROOF_TYPES = {
  IdentityProof: [
    { name: 'agent', type: 'address' },
    { name: 'delegationId', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'verifier', type: 'address' },
  ],
} as const;

/**
 * Create the EIP-712 domain for identity proofs.
 */
export function createProofDomain(
  chainId: number,
  identityRegistryAddress: `0x${string}`
): IdentityProofDomain {
  return {
    name: 'Nexoid',
    version: '1',
    chainId,
    verifyingContract: identityRegistryAddress,
  };
}

/**
 * Generate an unsigned identity proof.
 */
export function createProof(
  agentAddress: `0x${string}`,
  delegationId: bigint,
  verifierAddress: `0x${string}`,
  nonce?: `0x${string}`
): IdentityProof {
  // Generate random nonce if not provided
  const proofNonce = nonce ?? generateNonce();

  return {
    agent: agentAddress,
    delegationId,
    nonce: proofNonce,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    verifier: verifierAddress,
  };
}

/**
 * Generate a random 32-byte nonce.
 */
export function generateNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

/**
 * Verify an EIP-712 identity proof signature.
 * Returns true if the signature was created by the claimed agent address.
 */
export async function verifyProof(
  signedProof: SignedIdentityProof
): Promise<{ valid: boolean; recoveredAddress: `0x${string}` }> {
  try {
    const valid = await verifyTypedData({
      address: signedProof.proof.agent,
      domain: signedProof.domain,
      types: IDENTITY_PROOF_TYPES,
      primaryType: 'IdentityProof',
      message: {
        agent: signedProof.proof.agent,
        delegationId: signedProof.proof.delegationId,
        nonce: signedProof.proof.nonce,
        timestamp: signedProof.proof.timestamp,
        verifier: signedProof.proof.verifier,
      },
      signature: signedProof.signature,
    });

    return { valid, recoveredAddress: signedProof.proof.agent };
  } catch {
    return { valid: false, recoveredAddress: signedProof.proof.agent };
  }
}

/**
 * Check if a proof has expired (older than maxAgeSeconds).
 */
export function isProofExpired(proof: IdentityProof, maxAgeSeconds = 300): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now - proof.timestamp > BigInt(maxAgeSeconds);
}

/**
 * Serialize a signed proof to JSON (handles bigint serialization).
 */
export function serializeProof(signedProof: SignedIdentityProof): string {
  return JSON.stringify({
    proof: {
      agent: signedProof.proof.agent,
      delegationId: signedProof.proof.delegationId.toString(),
      nonce: signedProof.proof.nonce,
      timestamp: signedProof.proof.timestamp.toString(),
      verifier: signedProof.proof.verifier,
    },
    signature: signedProof.signature,
    domain: signedProof.domain,
  }, null, 2);
}

/**
 * Deserialize a signed proof from JSON.
 */
export function deserializeProof(json: string): SignedIdentityProof {
  const data = JSON.parse(json);
  return {
    proof: {
      agent: data.proof.agent,
      delegationId: BigInt(data.proof.delegationId),
      nonce: data.proof.nonce,
      timestamp: BigInt(data.proof.timestamp),
      verifier: data.proof.verifier,
    },
    signature: data.signature,
    domain: data.domain,
  };
}
