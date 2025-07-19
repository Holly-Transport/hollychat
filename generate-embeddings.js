import fs from 'fs-extra';
import path from 'path';
import mammoth from 'mammoth';
import readline from 'readline';
import OpenAI from 'openai';
import pdfjs from 'pdfjs-dist';
const { getDocument } = pdfjs;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY environment variable.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') return await fs.readFile(filePath, 'utf8');

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === '.json') {
    const json = await fs.readJson(filePath);
    return JSON.stringify(json, null, 2);
  }

  if (ext === '.pdf') {
    const data = new Uint8Array(await fs.readFile(filePath));
    const pdf = await getDocument({ data }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n\n';
    }
    return text;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function chunkText(text, maxLength = 1000) {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .flatMap(p => (p.length <= maxLength ? [p] : p.match(/.{1,1000}/g)));
}

function chunkByCVSections(text) {
  const headers = [
    "Holly Krambeck",
    "Summary",
    "Education",
    "Positions",
    "Honors and Awards",
    "Skills",
    "Publications and Conference Proceedings",
    "Storytelling",
    "Interviews and Appearances in Articles and Newscasts",
    "Blogs",
    "Public Service"
  ];

  const headerRegex = new RegExp(
    headers.map(h => `\\b${h.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).join('|'),
    'i'
);

  const lines = text.split('\n');
  let sections = [];
  let currentHeader = null;
  let currentContent = [];

  for (const line of lines) {
    if (headerRegex.test(line.trim())) {
      if (currentHeader && currentContent.length) {
        sections.push({
          header: currentHeader,
          content: currentContent.join('\n').trim()
        });
      }
      currentHeader = line.trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentHeader && currentContent.length) {
    sections.push({
      header: currentHeader,
      content: currentContent.join('\n').trim()
    });
  }

  return sections.map(s => `${s.header}:\n${s.content}`);
}

async function embedText(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return response.data[0].embedding;
}

async function processFile(filePath) {
  const base = path.basename(filePath);
  const text = await extractText(filePath);

  const type = base.toLowerCase().includes('cv') ? 'cv'
              : base.toLowerCase().includes('review') ? 'review'
              : base.toLowerCase().includes('job') ? 'jd'
              : 'other';

  const chunks = type === 'cv' ? chunkByCVSections(text) : chunkText(text);

  console.log(`📄 ${base}: ${chunks.length} chunks`);

  const embedded = [];

  const taggedChunks = chunks.map(text => {
    const tags = [];

    if (/AI|data science|automation|machine learning/i.test(text)) tags.push('technical');
    if (/lead|manage|mentor|team|strategy/i.test(text)) tags.push('leadership');
    if (/partner|collaborate|stakeholder|engagement/i.test(text)) tags.push('collaboration');
    if (/award|innovation|novel|initiative/i.test(text)) tags.push('innovation');

    return { source: base, type, tags, text };
  });

  for (const chunk of taggedChunks) {
    const embedding = await embedText(chunk.text);
    embedded.push({ ...chunk, embedding });
  }

  return embedded;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('📂 Enter path to file (txt, pdf, docx, json): ', async (filePath) => {
    rl.close();
    try {
      const results = await processFile(filePath.trim());
      const outputFile = `embeddings/${path.basename(filePath, path.extname(filePath))}.json`;
      await fs.outputJson(outputFile, results, { spaces: 2 });
      console.log(`✅ Saved ${results.length} chunks to ${outputFile}`);
    } catch (err) {
      console.error(`❌ ${err.message}`);
    }
  });
}

main();
