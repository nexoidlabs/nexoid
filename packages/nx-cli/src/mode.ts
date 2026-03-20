import { loadConfig, type CliMode } from './config.js';
import { error } from './output.js';

/**
 * Resolve the effective mode: --mode flag > config profile mode.
 */
export function resolveMode(globalOpts: { mode?: string; profile?: string }): CliMode {
  if (globalOpts.mode) {
    if (globalOpts.mode !== 'operator' && globalOpts.mode !== 'agent') {
      error(`Invalid mode "${globalOpts.mode}". Use "operator" or "agent".`, 'validation');
    }
    return globalOpts.mode as CliMode;
  }
  try {
    const profile = loadConfig(globalOpts.profile);
    return profile.mode;
  } catch {
    return 'operator'; // Default to operator if no config yet
  }
}

/**
 * Enforce operator-only access. Exits with code 3 if in agent mode.
 */
export function requireOperatorMode(globalOpts: { mode?: string; profile?: string }): void {
  const mode = resolveMode(globalOpts);
  if (mode === 'agent') {
    error('This command is only available in operator mode.', 'validation');
  }
}
