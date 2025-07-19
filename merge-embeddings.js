// merge-embeddings.js
import fs from 'fs-extra';
import path from 'path';

const embeddingsDir = './embeddings';
const outputFile = 'knowledge-base.json';

async function mergeEmbeddings() {
  try {
    const files = await fs.readdir(embeddingsDir);
    let combined = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await fs.readJson(path.join(embeddingsDir, file));
        combined.push(...data);
      }
    }

    await fs.outputJson(outputFile, combined, { spaces: 2 });
    console.log(`✅ Merged ${combined.length} chunks from ${files.length} files into ${outputFile}`);
  } catch (err) {
    console.error('❌ Failed to merge embeddings:', err.message);
  }
}

mergeEmbeddings();
