import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Complementary secret-safety scanner for P0-AC10.
 * Inspects:
 *   1. All Git-tracked source files (excluding documented placeholder lines in `.env.example` and scanner rules themselves)
 *   2. Production build assets in `dist/` when present
 *
 * Note: Used alongside `gitleaks` in GitHub Actions CI and GitHub Secret Scanning to guard commit history.
 */

const SECRET_RULES = [
  {
    id: 'supabase-secret-key',
    description: 'Supabase server secret key (sb_secret_...)',
    regex: /\bsb_secret_[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    id: 'supabase-personal-access-token',
    description: 'Supabase personal access token (sbp_...)',
    regex: /\bsbp_[a-f0-9]{30,}\b/gi,
  },
  {
    id: 'postgres-connection-uri',
    description: 'PostgreSQL connection string with embedded credentials',
    regex: /\bpostgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@[^\s"']+/gi,
  },
  {
    id: 'private-key-pem',
    description: 'PEM-encoded private key block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'github-token',
    description: 'GitHub personal or fine-grained access token',
    regex: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
  },
  {
    id: 'jwt-privileged-role',
    description: 'JWT containing service_role or supabase_admin payload',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    validateMatch(match) {
      const parts = match.split('.');
      const payload = parts[1];
      if (!payload) {
        return false;
      }
      try {
        const json = Buffer.from(payload, 'base64url').toString('utf8');
        return json.includes('"service_role"') || json.includes('"supabase_admin"');
      } catch {
        return false;
      }
    },
  },
];

const FORBIDDEN_TRACKED_ENV_FILES = /^\.env(?:\.(?!example$).+)?$/;

function getTrackedFiles() {
  const stdout = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
  return stdout
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const collected = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collected.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      collected.push(path.relative(process.cwd(), fullPath).replace(/\\/g, '/'));
    }
  }
  return collected;
}

function isBinaryBuffer(buffer) {
  const sampleLength = Math.min(buffer.length, 4096);
  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

const findings = [];
const trackedFiles = getTrackedFiles();

for (const relPath of trackedFiles) {
  const baseName = path.posix.basename(relPath);
  if (FORBIDDEN_TRACKED_ENV_FILES.test(baseName)) {
    findings.push({
      file: relPath,
      rule: 'tracked-env-file',
      detail: 'Environment file other than .env.example is tracked by Git.',
    });
  }
}

const distFiles = walkFiles(path.resolve(process.cwd(), 'dist'));
const targets = [...new Set([...trackedFiles, ...distFiles])];

for (const relPath of targets) {
  if (relPath === 'scripts/scan-secrets.mjs') {
    continue;
  }

  const absPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    continue;
  }

  const buffer = fs.readFileSync(absPath);
  if (isBinaryBuffer(buffer)) {
    continue;
  }

  const content = buffer.toString('utf8');

  for (const rule of SECRET_RULES) {
    rule.regex.lastIndex = 0;
    let match = rule.regex.exec(content);
    while (match !== null) {
      const matchedText = match[0];
      const isConfirmed = rule.validateMatch ? rule.validateMatch(matchedText) : true;
      if (isConfirmed) {
        findings.push({
          file: relPath,
          rule: rule.id,
          detail: rule.description,
        });
      }
      match = rule.regex.exec(content);
    }
  }
}

if (findings.length > 0) {
  console.error('Secret scan failed with findings:');
  for (const finding of findings) {
    console.error(`  - [${finding.rule}] ${finding.file}: ${finding.detail}`);
  }
  process.exit(1);
}

console.log(
  `Secret scan passed (${trackedFiles.length} tracked files, ${distFiles.length} dist assets inspected).`,
);
