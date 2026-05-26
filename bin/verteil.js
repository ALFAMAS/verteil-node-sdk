#!/usr/bin/env node
/**
 * @fileoverview Verteil NDC API CLI tool.
 *
 * Usage:
 *   verteil airshopping --params params.json
 *   verteil order:retrieve --owner EK --pnr ABC123
 *   verteil order:cancel   --owner EK --pnr ABC123
 *   verteil openapi        [--out openapi.json]
 *   verteil repl
 *   verteil --help
 *
 * Configuration is read from environment variables:
 *   VERTEIL_BASE_URL, VERTEIL_USERNAME, VERTEIL_PASSWORD,
 *   VERTEIL_THIRD_PARTY_ID, VERTEIL_OFFICE_ID
 */

import { readFileSync, writeFileSync } from 'fs';
import { createInterface }             from 'readline';
import { createRequire }               from 'module';
import path                            from 'path';
import { fileURLToPath }               from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath   = path.join(__dirname, '..', 'package.json');
const pkg       = JSON.parse(readFileSync(pkgPath, 'utf8'));

// ── Argument parser ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args   = argv.slice(2);
  const flags  = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(args[i]);
    }
  }

  return { command: positional[0], flags };
}

// ── Config from env ──────────────────────────────────────────────────────────

function buildConfig() {
  return {
    baseUrl:      process.env.VERTEIL_BASE_URL      ?? 'https://api.verteil.com',
    username:     process.env.VERTEIL_USERNAME       ?? '',
    password:     process.env.VERTEIL_PASSWORD       ?? '',
    thirdPartyId: process.env.VERTEIL_THIRD_PARTY_ID ?? null,
    officeId:     process.env.VERTEIL_OFFICE_ID      ?? null,
  };
}

// ── Client loader ────────────────────────────────────────────────────────────

async function loadClient() {
  const { default: VerteilClient } = await import('../src/VerteilClient.js');
  const config = buildConfig();

  if (!config.username || !config.password) {
    die('VERTEIL_USERNAME and VERTEIL_PASSWORD environment variables are required.');
  }

  const client = new VerteilClient(config);
  await client.authenticate();
  return client;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function die(msg, code = 1) {
  process.stderr.write(`\x1b[31mError:\x1b[0m ${msg}\n`);
  process.exit(code);
}

function out(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function loadParams(flagsParamsPath, inline) {
  if (inline) {
    try { return JSON.parse(inline); } catch { die('--params value is not valid JSON'); }
  }
  if (flagsParamsPath) {
    try {
      return JSON.parse(readFileSync(flagsParamsPath, 'utf8'));
    } catch (e) {
      die(`Could not read params file: ${e.message}`);
    }
  }
  return {};
}

// ── Commands ─────────────────────────────────────────────────────────────────

const COMMANDS = {
  async airshopping({ flags }) {
    const client = await loadClient();
    const params = loadParams(flags.params, flags.inline);
    out(await client.airShopping(params));
  },

  async 'flight:price'({ flags }) {
    const client = await loadClient();
    const params = loadParams(flags.params, flags.inline);
    out(await client.flightPrice(params));
  },

  async 'order:create'({ flags }) {
    const client = await loadClient();
    const params = loadParams(flags.params, flags.inline);
    out(await client.createOrder(params));
  },

  async 'order:retrieve'({ flags }) {
    if (!flags.owner || !flags.pnr) die('--owner and --pnr are required');
    const client = await loadClient();
    out(await client.retrieveOrder({ owner: flags.owner, orderId: flags.pnr, channel: flags.channel }));
  },

  async 'order:cancel'({ flags }) {
    if (!flags.owner || !flags.pnr) die('--owner and --pnr are required');
    const client = await loadClient();
    out(await client.cancelOrder({ orders: [{ owner: flags.owner, orderId: flags.pnr }] }));
  },

  async 'order:reshop'({ flags }) {
    const client = await loadClient();
    const params = loadParams(flags.params, flags.inline);
    if (flags.owner) params.owner   = flags.owner;
    if (flags.pnr)   params.orderId = flags.pnr;
    out(await client.reshopOrder(params));
  },

  async 'seat:availability'({ flags }) {
    const client = await loadClient();
    const params = loadParams(flags.params, flags.inline);
    params.type = flags.type ?? params.type ?? 'pre';
    out(await client.getSeatAvailability(params));
  },

  async 'service:list'({ flags }) {
    const client = await loadClient();
    const params = loadParams(flags.params, flags.inline);
    params.type = flags.type ?? params.type ?? 'pre';
    out(await client.getServiceList(params));
  },

  async openapi({ flags }) {
    const { generateSpecJson } = await import('../src/openapi/spec.js');
    const json = generateSpecJson({
      serverUrl: flags.server ?? process.env.VERTEIL_BASE_URL ?? 'https://api.verteil.com',
      title:     flags.title  ?? 'Verteil NDC API Wrapper',
    });

    if (flags.out) {
      writeFileSync(flags.out, json, 'utf8');
      process.stderr.write(`OpenAPI spec written to ${flags.out}\n`);
    } else {
      process.stdout.write(json + '\n');
    }
  },

  async repl() {
    await startRepl();
  },

  version() {
    process.stdout.write(`verteil-wrapper v${pkg.version}\n`);
  },

  help() {
    process.stdout.write(`
\x1b[1mverteil-wrapper\x1b[0m v${pkg.version} — Verteil NDC API CLI

\x1b[1mUsage:\x1b[0m
  verteil <command> [options]

\x1b[1mCommands:\x1b[0m
  airshopping         Search for available flights
  flight:price        Price a specific offer
  order:create        Create a new order (book)
  order:retrieve      Retrieve an existing order  --owner <code> --pnr <ref>
  order:cancel        Cancel an order             --owner <code> --pnr <ref>
  order:reshop        Re-shop an existing order
  seat:availability   Get seat map                --type pre|post
  service:list        List ancillary services     --type pre|post
  openapi             Print/save OpenAPI spec     [--out openapi.json]
  repl                Interactive REPL
  version             Print version
  help                Show this message

\x1b[1mOptions:\x1b[0m
  --params <file>     Path to a JSON file with request parameters
  --inline <json>     Inline JSON string of request parameters
  --owner  <code>     Airline IATA owner code (e.g. EK)
  --pnr    <ref>      PNR / booking reference
  --type   <type>     Request type: pre | post
  --out    <file>     Output file path
  --server <url>      Base server URL (overrides VERTEIL_BASE_URL)

\x1b[1mEnvironment variables:\x1b[0m
  VERTEIL_BASE_URL          API base URL (default: https://api.verteil.com)
  VERTEIL_USERNAME          API username (required)
  VERTEIL_PASSWORD          API password (required)
  VERTEIL_THIRD_PARTY_ID    Third-party agent ID
  VERTEIL_OFFICE_ID         Office / GDS ID

\x1b[1mExamples:\x1b[0m
  verteil airshopping --params search.json
  verteil order:retrieve --owner EK --pnr ABC123
  verteil openapi --out openapi.json
  verteil repl
`.trim() + '\n');
  },
};

// ── REPL mode ─────────────────────────────────────────────────────────────────

async function startRepl() {
  const { default: VerteilClient }   = await import('../src/VerteilClient.js');
  const { default: ItineraryBuilder } = await import('../src/helpers/ItineraryBuilder.js');
  const { default: CurrencyNormalizer } = await import('../src/helpers/CurrencyNormalizer.js');

  const config = buildConfig();
  let client = null;

  if (config.username && config.password) {
    try {
      client = new VerteilClient(config);
      await client.authenticate();
      process.stderr.write('\x1b[32m✓ Authenticated\x1b[0m\n');
    } catch (e) {
      process.stderr.write(`\x1b[33m⚠ Auth failed: ${e.message}\x1b[0m\n`);
    }
  }

  // Use Node.js built-in REPL
  const repl = await import('repl');
  const server = repl.start({
    prompt: '\x1b[36mverteil>\x1b[0m ',
    useGlobal: false,
  });

  Object.assign(server.context, {
    client,
    VerteilClient,
    ItineraryBuilder,
    CurrencyNormalizer,
    buildConfig,
    help: () => {
      process.stdout.write([
        '',
        'Available variables:',
        '  client          — VerteilClient instance (if authenticated)',
        '  VerteilClient   — VerteilClient class',
        '  ItineraryBuilder — ItineraryBuilder class',
        '  CurrencyNormalizer — CurrencyNormalizer class',
        '  buildConfig()   — returns config from env vars',
        '',
        'Example:',
        '  await client.airShopping({ ... })',
        '',
      ].join('\n'));
    },
  });

  server.on('exit', () => process.exit(0));
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (!command || flags.help || command === 'help') {
    COMMANDS.help();
    return;
  }

  if (command === 'version' || flags.version) {
    COMMANDS.version();
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    die(`Unknown command: "${command}"\nRun "verteil help" for usage.`);
  }

  try {
    await handler({ flags });
  } catch (err) {
    die(err.message);
  }
}

main();
