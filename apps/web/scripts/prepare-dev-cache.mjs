import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const nextDir = join(process.cwd(), '.next');
const productionBuildId = join(nextDir, 'BUILD_ID');
const serverRuntime = join(nextDir, 'server', 'webpack-runtime.js');
const serverChunksDir = join(nextDir, 'server', 'chunks');
const layoutCss = join(nextDir, 'static', 'css', 'app', 'layout.css');

if (!existsSync(nextDir)) {
  process.exit(0);
}

const isProductionBuild = existsSync(productionBuildId);
const isCorruptDevCache = existsSync(serverRuntime) && !existsSync(layoutCss);
const hasServerChunks = existsSync(serverChunksDir) && readdirSync(serverChunksDir).some((file) => file.endsWith('.js'));
const hasStaleRootChunkRuntime =
  existsSync(serverRuntime) &&
  hasServerChunks &&
  readFileSync(serverRuntime, 'utf8').includes('return "" + chunkId + ".js"');

if (isProductionBuild || isCorruptDevCache || hasStaleRootChunkRuntime) {
  rmSync(nextDir, { recursive: true, force: true });
  console.log('Cleared stale Next.js cache before starting dev server.');
}
