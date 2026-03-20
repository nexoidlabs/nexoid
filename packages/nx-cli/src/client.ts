import { NexoidClient, deriveOperator } from '@nexoid/core-client';
import { loadConfig, getPrivateKey, getSeedPhrase, type NxCliProfile, ConfigError } from './config.js';
import { error, warn } from './output.js';

/**
 * Build a NexoidClient from the config profile.
 * Private key comes from NEXOID_PRIVATE_KEY env var only.
 * If dryRun is true, returns a proxy that intercepts write operations.
 */
export function buildClient(profileName?: string, dryRun = false): NexoidClient {
  let profile: NxCliProfile;
  try {
    profile = loadConfig(profileName);
  } catch (e) {
    if (e instanceof ConfigError) {
      error(e.message, 'config');
    }
    throw e;
  }

  let privateKey = getPrivateKey();
  if (!privateKey) {
    // Derive operator private key from seed phrase if available
    const seedPhrase = getSeedPhrase();
    if (seedPhrase) {
      const operator = deriveOperator(seedPhrase);
      privateKey = operator.privateKey;
    } else {
      error('No private key. Set NEXOID_PRIVATE_KEY or NEXOID_SEED_PHRASE environment variable.', 'config');
    }
  }

  const client = new NexoidClient({
    rpcUrl: profile.rpcUrl,
    registryAddress: profile.registryAddress,
    delegationRegistryAddress: profile.delegationRegistryAddress,
    tokenAddress: profile.tokenAddress,
    nexoidModuleAddress: profile.nexoidModuleAddress,
    privateKey,
  });

  if (!dryRun) return client;

  return createDryRunProxy(client);
}

/**
 * Creates a proxy around NexoidClient that intercepts write operations
 * (methods that submit on-chain transactions) and logs them instead.
 */
function createDryRunProxy(client: NexoidClient): NexoidClient {
  const writeMethods = new Set([
    'createAgent',
    'updateIdentityStatus',
    'delegate',
    'revoke',
    'sendUSDT',
    'setAllowance',
    'deploySafe',
    'enableAllowanceModule',
    'registerIdentityFor',
    'setRegistrar',
    'transferAdmin',
  ]);

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === 'string' && writeMethods.has(prop) && typeof value === 'function') {
        return async (...args: unknown[]) => {
          warn(`[dry-run] Would call ${prop}(${JSON.stringify(args).slice(1, -1)})`);
          return { txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as const };
        };
      }
      return value;
    },
  });
}
