
import fse from 'fs-extra';
import path from 'path';
import { Parser } from 'xml2js';

const CACHE_DIR = '.asfst-cache';

async function cacheMetadata(sourceDir) {
  await fse.ensureDir(CACHE_DIR);

  const files = await fse.readdir(sourceDir);

  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    const stat = await fse.stat(filePath);

    if (stat.isDirectory()) {
      await cacheMetadata(filePath);
    } else {
      await processFile(filePath);
    }
  }
}

async function processFile(filePath) {
  const fileExtension = path.extname(filePath);
  const baseName = path.basename(filePath);

  const destinationPath = path.join(CACHE_DIR, path.relative('./metadata', filePath));
  await fse.ensureDir(path.dirname(destinationPath));

  if (fileExtension === '.xml') {
    const xml = await fse.readFile(filePath);
    const parser = new Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);
    const jsonPath = destinationPath.replace('.xml', '.json');
    await fse.writeJson(jsonPath, result, { spaces: 2 });
  } else {
    await fse.copy(filePath, destinationPath);
  }
}

async function clearCache() {
    await fse.remove(CACHE_DIR);
}


export { cacheMetadata, clearCache };
