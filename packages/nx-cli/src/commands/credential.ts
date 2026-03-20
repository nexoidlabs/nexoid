import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildClient } from '../client.js';
import { getConfigDir } from '../config.js';
import { kv, primary, success, error, warn, table, isJsonMode } from '../output.js';
import { requireOperatorMode } from '../mode.js';
import type { EmailCredential } from '@nexoid/nx-core';

interface PendingEmail {
  emailHash: string;
  emailDomain: string;
  expectedOtp: string;
  createdAt: string;
}

function getPendingEmailPath(): string {
  return join(getConfigDir(), '.pending-email.json');
}

function getCredentialsPath(): string {
  return join(getConfigDir(), 'credentials.json');
}

function loadCredentials(): EmailCredential[] {
  const path = getCredentialsPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as EmailCredential[];
  } catch {
    return [];
  }
}

function saveCredentials(creds: EmailCredential[]): void {
  writeFileSync(getCredentialsPath(), JSON.stringify(creds, null, 2) + '\n', 'utf-8');
}

export function registerCredentialCommands(program: Command): void {
  const credCmd = program
    .command('credential')
    .description('Credential management');

  // nxcli credential verify-email <email>
  credCmd
    .command('verify-email <email>')
    .description('Start email verification — sends OTP')
    .action(async (email: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);
      const client = buildClient(globalOpts.profile);

      const result = await client.initiateEmailVerification(email);

      // Save pending state
      const pending: PendingEmail = {
        emailHash: result.emailHash,
        emailDomain: result.emailDomain,
        expectedOtp: result.otp,
        createdAt: new Date().toISOString(),
      };
      writeFileSync(getPendingEmailPath(), JSON.stringify(pending, null, 2) + '\n', 'utf-8');

      kv({
        emailDomain: result.emailDomain,
        status: 'OTP sent',
      });

      // In dev environments, show the OTP (no email delivery service yet)
      if (process.env['NODE_ENV'] !== 'production') {
        kv({ otp: result.otp });
        if (!isJsonMode()) success('Dev mode: OTP shown above. In production, check your email.');
      } else {
        if (!isJsonMode()) success('Check your email for the OTP, then run `nxcli credential confirm-email <otp>`');
      }
    });

  // nxcli credential confirm-email <otp>
  credCmd
    .command('confirm-email <otp>')
    .description('Complete email verification with the OTP')
    .action(async (otp: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);
      const client = buildClient(globalOpts.profile);

      const pendingPath = getPendingEmailPath();
      if (!existsSync(pendingPath)) {
        error('No pending verification. Run `nxcli credential verify-email <email>` first.', 'validation');
      }

      let pending: PendingEmail;
      try {
        pending = JSON.parse(readFileSync(pendingPath, 'utf-8')) as PendingEmail;
      } catch {
        error('Corrupt pending verification file. Re-run `nxcli credential verify-email`.', 'config');
      }

      const credential = await client.completeEmailVerification(
        pending!.emailHash,
        pending!.emailDomain,
        otp,
        pending!.expectedOtp,
      );

      // Save credential
      const creds = loadCredentials();
      creds.push(credential);
      saveCredentials(creds);

      // Clean up pending file
      const { unlinkSync } = await import('node:fs');
      unlinkSync(pendingPath);

      kv({
        type: credential.type,
        emailDomain: credential.emailDomain,
        verified: String(credential.verified),
        verifiedAt: credential.verifiedAt,
      });
      if (!isJsonMode()) success('Email verified and credential saved.');
    });

  // nxcli credential show
  credCmd
    .command('show')
    .description('Show stored credentials')
    .action(() => {
      const creds = loadCredentials();
      if (creds.length === 0) {
        if (isJsonMode()) {
          primary('[]');
        } else {
          error('No credentials stored. Verify an email with `nxcli credential verify-email`.', 'validation');
        }
        return;
      }

      table(
        ['Type', 'Domain', 'Verified', 'Date'],
        creds.map(c => [c.type, c.emailDomain, String(c.verified), c.verifiedAt]),
      );
    });

  // nxcli credential disclose
  credCmd
    .command('disclose')
    .description('Create a signed disclosure of the first email credential')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);

      const creds = loadCredentials();
      if (creds.length === 0) {
        error('No credentials to disclose. Verify an email first.', 'validation');
      }

      const credential = creds[0]!;
      const disclosure = client.formatEmailDisclosure(credential);
      primary(disclosure);
    });

  // nxcli credential prove --delegation <id> --verifier <address> [--nonce <hex>]
  credCmd
    .command('prove')
    .description('Generate an EIP-712 identity proof (agent mode)')
    .requiredOption('--delegation <id>', 'Delegation ID to prove')
    .requiredOption('--verifier <address>', 'Verifier address')
    .option('--nonce <hex>', 'Custom nonce (32-byte hex, auto-generated if not provided)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);

      const { serializeProof } = await import('@nexoid/core-client');

      const signedProof = await client.generateIdentityProof(
        BigInt(opts.delegation),
        opts.verifier as `0x${string}`,
        opts.nonce as `0x${string}` | undefined
      );

      if (isJsonMode()) {
        // In JSON mode, output the serialized proof
        process.stdout.write(serializeProof(signedProof) + '\n');
      } else {
        kv({
          agent: signedProof.proof.agent,
          delegationId: signedProof.proof.delegationId.toString(),
          nonce: signedProof.proof.nonce,
          timestamp: signedProof.proof.timestamp.toString(),
          verifier: signedProof.proof.verifier,
          signature: signedProof.signature,
        });
        success('Identity proof generated. Use --json for machine-readable output.');
      }
    });

  // nxcli credential verify-proof <json>
  credCmd
    .command('verify-proof')
    .description('Verify an EIP-712 identity proof')
    .argument('<proofJson>', 'Proof JSON (or use - for stdin)')
    .action(async (proofJsonArg: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);

      const { deserializeProof } = await import('@nexoid/core-client');

      let json = proofJsonArg;
      if (json === '-') {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        json = Buffer.concat(chunks).toString('utf-8');
      }

      const signedProof = deserializeProof(json);
      const result = await client.verifyIdentityProof(signedProof);

      kv({
        valid: String(result.valid),
        expired: String(result.expired),
        agent: result.recoveredAddress,
      });

      if (!isJsonMode()) {
        if (result.valid && !result.expired) {
          success('Proof is valid.');
        } else if (result.valid && result.expired) {
          warn('Proof signature is valid but expired (>5 minutes old).');
        } else {
          error('Proof signature is invalid.', 'validation');
        }
      }
    });
}
