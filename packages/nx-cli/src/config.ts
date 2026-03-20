import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type CliMode = 'operator' | 'agent';

export interface NxCliProfile {
  mode: CliMode;
  rpcUrl: string;
  registryAddress: `0x${string}`;
  safeAddress?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  /** NexoidModule contract address (for agent Safe registry). */
  nexoidModuleAddress: `0x${string}`;
  /** Next BIP-44 index for WDK agent derivation (starts at 1). */
  nextAgentIndex?: number;
}

export interface NxCliConfig {
  version: '1';
  defaultProfile: string;
  profiles: Record<string, NxCliProfile>;
}

const CONFIG_DIR = join(homedir(), '.nxcli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

/**
 * Load a named profile from the config file.
 * Environment variables take highest precedence over file values.
 * Private key is NEVER stored in config — always via NEXOID_PRIVATE_KEY env var.
 */
export function loadConfig(profileName?: string): NxCliProfile {
  if (!configExists()) {
    throw new ConfigError(`Config not found at ${CONFIG_FILE}. Run \`nxcli init\` first.`);
  }

  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  let config: NxCliConfig;
  try {
    config = JSON.parse(raw) as NxCliConfig;
  } catch {
    throw new ConfigError(`Invalid JSON in ${CONFIG_FILE}`);
  }

  const name = profileName ?? config.defaultProfile ?? 'default';
  const profile = config.profiles[name];
  if (!profile) {
    throw new ConfigError(`Profile "${name}" not found in config. Available: ${Object.keys(config.profiles).join(', ')}`);
  }

  // Env overrides (highest precedence)
  return {
    mode: (process.env['NEXOID_MODE'] as CliMode | undefined) ?? profile.mode,
    rpcUrl: process.env['NEXOID_RPC_URL'] ?? profile.rpcUrl,
    registryAddress: (process.env['NEXOID_REGISTRY'] as `0x${string}` | undefined) ?? profile.registryAddress,
    safeAddress: (process.env['NEXOID_SAFE'] as `0x${string}` | undefined) ?? profile.safeAddress,
    tokenAddress: (process.env['NEXOID_TOKEN'] as `0x${string}` | undefined) ?? profile.tokenAddress,
    nexoidModuleAddress: (process.env['NEXOID_MODULE'] as `0x${string}` | undefined) ?? profile.nexoidModuleAddress,
    nextAgentIndex: profile.nextAgentIndex,
  };
}

/**
 * Get the private key from environment variable only.
 */
export function getPrivateKey(): `0x${string}` | undefined {
  return process.env['NEXOID_PRIVATE_KEY'] as `0x${string}` | undefined;
}

/**
 * Get the WDK seed phrase from environment variable only.
 * Never stored in the config file for security.
 */
export function getSeedPhrase(): string | undefined {
  return process.env['NEXOID_SEED_PHRASE'];
}

/**
 * Write the full config to disk with restricted permissions (0600).
 */
export function saveConfig(config: NxCliConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  chmodSync(CONFIG_FILE, 0o600);
}

/**
 * Initialize a new config with a single profile.
 */
export function initConfig(profile: NxCliProfile, name = 'default'): void {
  const config: NxCliConfig = {
    version: '1',
    defaultProfile: name,
    profiles: { [name]: profile },
  };
  saveConfig(config);
}

/**
 * Update a field in a named profile.
 */
export function updateProfile(profileName: string, updates: Partial<NxCliProfile>): void {
  if (!configExists()) {
    throw new ConfigError('Config not found. Run `nxcli init` first.');
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  const config = JSON.parse(raw) as NxCliConfig;
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new ConfigError(`Profile "${profileName}" not found.`);
  }
  config.profiles[profileName] = { ...profile, ...updates };
  saveConfig(config);
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
