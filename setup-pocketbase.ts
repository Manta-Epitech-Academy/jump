import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const TARGET_DIR = 'pocketbase-backend';

console.log('🔍 Checking for latest PocketBase version...');

// 1. Fetch latest version via GitHub API
const response = await fetch('https://api.github.com/repos/pocketbase/pocketbase/releases/latest');
if (!response.ok) throw new Error(`Failed to fetch version: ${response.statusText}`);

const data = await response.json();
const version = data.tag_name.replace('v', '');

console.log(`✅ Detected latest version: ${version}`);

// 2. Detect OS/Arch
const platform =
	process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : 'amd64';
const ext = '.zip';
const binaryName = platform === 'windows' ? 'pocketbase.exe' : 'pocketbase';

const downloadUrl = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${platform}_${arch}${ext}`;
const zipPath = 'pb.zip';

// 3. Download
if (!existsSync(TARGET_DIR)) mkdirSync(TARGET_DIR, { recursive: true });

console.log(`⬇️  Downloading from ${downloadUrl}...`);
const fileRes = await fetch(downloadUrl);
await Bun.write(zipPath, fileRes);

// 4. Extract
console.log('📦 Extracting...');
// Windows 10+ has tar, but unzip is standard on unix.
// For max compatibility in a script, we assume basic shell tools exist.
if (platform === 'windows') {
	execSync(`tar -xf ${zipPath} -C ${TARGET_DIR}`);
} else {
	execSync(`unzip -o ${zipPath} -d ${TARGET_DIR}`);
	chmodSync(path.join(TARGET_DIR, binaryName), '755');
}

// 5. Cleanup
unlinkSync(zipPath);

console.log(`🚀 PocketBase ${version} installed to ./${TARGET_DIR}`);
