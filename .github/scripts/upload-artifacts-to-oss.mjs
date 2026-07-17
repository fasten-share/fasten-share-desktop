#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import OSS from 'ali-oss';

const artifactRoot = path.resolve(process.cwd(), process.env.OSS_UPLOAD_DIR || 'release-assets');
const basePrefix = normalizePrefix(process.env.OSS_PREFIX || 'download');
const cleanPrefixes = toBoolean(process.env.OSS_CLEAN_PLATFORM_PREFIXES || 'false');
const requiredEnv = ['OSS_REGION', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  fail(`Missing required env: ${missingEnv.join(', ')}`);
}

const client = new OSS({
  region: process.env.OSS_REGION,
  bucket: process.env.OSS_BUCKET,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  endpoint: process.env.OSS_ENDPOINT || undefined,
  secure: true,
});

const platforms = [
  ['windows', 'fasten-share-desktop-windows'],
  ['macos', 'fasten-share-desktop-macos'],
  ['linux', 'fasten-share-desktop-linux'],
];

for (const [platform, artifactName] of platforms) {
  const directory = path.join(artifactRoot, artifactName);
  const files = await collectFiles(directory);
  const platformPrefix = `${basePrefix}${platform}/`;

  if (files.length === 0) {
    fail(`No files found in ${directory}`);
  }

  if (cleanPrefixes) {
    await cleanRemotePrefix(platformPrefix);
  }

  for (const file of files) {
    const relativePath = toOssPath(path.relative(directory, file));
    const objectName = `${platformPrefix}${relativePath}`;
    await client.put(objectName, file, { headers: buildHeaders(relativePath) });
    console.log(`put ${objectName}`);
  }
}

console.log('OSS upload complete.');

async function collectFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail(`Artifact directory does not exist: ${directory}`);
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

async function cleanRemotePrefix(prefix) {
  console.log(`Cleaning oss://${process.env.OSS_BUCKET}/${prefix}`);
  let marker;

  do {
    const result = await client.list({ prefix, marker, 'max-keys': 1000 });
    const names = (result.objects || []).map((object) => object.name);
    if (names.length > 0) {
      await client.deleteMulti(names, { quiet: true });
      names.forEach((name) => console.log(`delete ${name}`));
    }
    marker = result.nextMarker;
  } while (marker);
}

function buildHeaders(relativePath) {
  const immutable = !/^latest.*\.ya?ml$/i.test(relativePath);
  return {
    'Cache-Control': immutable
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=300',
  };
}

function normalizePrefix(value) {
  const trimmed = String(value).trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

function toBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toOssPath(value) {
  return value.split(path.sep).join('/');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
