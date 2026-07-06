import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const nextDir = join(process.cwd(), '.next');
const productionBuildId = join(nextDir, 'BUILD_ID');
const serverRuntime = join(nextDir, 'server', 'webpack-runtime.js');
const layoutCss = join(nextDir, 'static', 'css', 'app', 'layout.css');

if (!existsSync(nextDir)) {
  process.exit(0);
}

const isProductionBuild = existsSync(productionBuildId);
const isCorruptDevCache = existsSync(serverRuntime) && !existsSync(layoutCss);

if (isProductionBuild || isCorruptDevCache) {
  rmSync(nextDir, { recursive: true, force: true });
  console.log('Cleared stale Next.js cache before starting dev server.');
}
