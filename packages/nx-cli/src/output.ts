import chalk from 'chalk';
import Table from 'cli-table3';

let jsonMode = false;
let quietMode = false;

export function setJsonMode(v: boolean): void {
  jsonMode = v;
}

export function setQuietMode(v: boolean): void {
  quietMode = v;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * Output key-value pairs. In JSON mode, writes a JSON object to stdout.
 * In normal mode, writes aligned key: value lines.
 */
export function kv(data: Record<string, string | undefined>): void {
  if (jsonMode) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) clean[k] = v;
    }
    process.stdout.write(JSON.stringify(clean) + '\n');
    return;
  }
  if (quietMode) return;

  const maxKey = Math.max(...Object.keys(data).map(k => k.length));
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      process.stdout.write(`${chalk.bold(k.padEnd(maxKey))}  ${v}\n`);
    }
  }
}

/**
 * Output a tabular dataset. In JSON mode, writes an array of row objects.
 */
export function table(headers: string[], rows: string[][]): void {
  if (jsonMode) {
    const objects = rows.map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });
    process.stdout.write(JSON.stringify(objects) + '\n');
    return;
  }
  if (quietMode) return;

  const t = new Table({ head: headers.map(h => chalk.cyan(h)) });
  for (const row of rows) {
    t.push(row);
  }
  process.stdout.write(t.toString() + '\n');
}

/**
 * Output a single primary value. In quiet mode, this is the only thing printed.
 */
export function primary(value: string): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ value }) + '\n');
    return;
  }
  process.stdout.write(value + '\n');
}

/**
 * Success message (green). Suppressed in JSON mode.
 */
export function success(msg: string): void {
  if (jsonMode || quietMode) return;
  process.stderr.write(chalk.green('✓ ') + msg + '\n');
}

/**
 * Warning message (yellow) to stderr.
 */
export function warn(msg: string): void {
  if (jsonMode) {
    process.stderr.write(JSON.stringify({ warning: msg }) + '\n');
    return;
  }
  process.stderr.write(chalk.yellow('⚠ ') + msg + '\n');
}

/**
 * Error message to stderr with typed exit codes.
 * config = 1, chain = 2, validation = 3
 */
export function error(msg: string, type: 'config' | 'chain' | 'validation' = 'validation'): never {
  const codes: Record<string, number> = { config: 1, chain: 2, validation: 3 };
  if (jsonMode) {
    process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  } else {
    process.stderr.write(chalk.red('Error: ') + msg + '\n');
  }
  process.exit(codes[type] ?? 1);
}
