import { cosineSimilarity } from './chatbot-utils.js';
import { Storage } from '@google-cloud/storage'; // GCS SDK
import fetch from 'node-fetch'; // Ensure this is installed for server-side fetch

let knowledgeBase = [];
const embeddingCache = new Map(); // Optional: in-memory cache

async function loadKnowledgeBase() {
    if (knowledgeBase.length === 0) {
        try {
            const storage = new Storage(); // Auto-uses GOOGLE_APPLICATION_CREDENTIALS
            const bucketName = 'itsti-chat';
            const fileName = 'knowledge-base.json';

            const [signedUrl] = await storage
                .bucket(bucketName)
                .file(fileName)
                .getSignedUrl({
                    version: 'v4',
                    action: 'read',
                    expires: Date.now() + 10 * 60 * 1000 // 10 minutes
                });

            console.log('✅ Signed URL generated.');

            const res = await fetch(signedUrl);
            if (!res.ok) throw new Error(`Failed to fetch knowledge base: ${res.statusText}`);

            knowledgeBase = await res.json();
        } catch (err) {
            console.error('❌ Failed to load knowledge base from GCS:', err);
        }
    }
}

function findRelevantChunks(queryEmbedding, topN = 5, preferredTags = []) {
    const scored = knowledgeBase.map(entry => {
        const sim = cosineSimilarity(entry.embedding, queryEmbedding);
        const tagBoost = preferredTags.some(tag => entry.tags?.includes(tag)) ? 0.1 : 0;
        const typeBoost = entry.type === 'cv' || entry.type === 'review' ? 0.05 : 0;
        return { ...entry, similarity: sim + tagBoost + typeBoost };
    });

    return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topN);
}

async function fetchEmbedding(prompt, apiKey, retries = 3) {
    if (!prompt) throw new Error("Prompt required for embedding.");

    // Optional: use cached embedding if available
    // if (embeddingCache.has(prompt)) return embeddingCache.get(prompt);

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                },
                body: JSON.stringify({ input: prompt, model: 'text-embedding-3-small' })
            });

            if (res.status === 429) {
                const delay = (attempt + 1) * 1000;
                console.warn(`⚠️ 429 received. Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Embedding API error: ${res.status} - ${errText}`);
            }

            const json = await res.json();
            const embedding = json?.data?.[0]?.embedding;
            if (!embedding) throw new Error("Invalid embedding response.");

            // Optional: cache it
            // embeddingCache.set(prompt, embedding);
            return embedding;

        } catch (err) {
            console.error("Embedding attempt failed:", err.message);
            if (attempt === retries - 1) throw err;
        }
    }

    throw new Error("Exceeded embedding retry attempts.");
}

export async function getOpenAIResponse(prompt, history, apiKey) {
    if (!prompt || !apiKey) {
        console.warn("Missing prompt or API key.");
        return "⚠️ Error: Missing prompt or API key.";
    }

    await loadKnowledgeBase();

    let queryEmbedding;
    try {
        queryEmbedding = await fetchEmbedding(prompt, apiKey);
    } catch (err) {
        console.error("Embedding error:", err.message);
        return "⚠️ Error generating embedding. Try again later.";
    }

    const topChunks = findRelevantChunks(queryEmbedding, 5, ['leadership', 'innovation']);
    const context = topChunks.map(c => {
        let label = 'Other';
        if (c.type === 'cv') label = 'CV';
        else if (c.type === 'review') label = 'Performance Review';
        else if (c.type === 'jd') label = 'Job Description';
        return `SOURCE: ${label}\n\n${c.text}`;
    }).join('\n\n');

    const messages = [
        {
            role: 'system',
            content: `You are Holly Krambeck’s AI assistant, helping her apply for the ITS Technology and Innovation Manager role at the World Bank.

Use ONLY the context provided below — which includes her CV, performance reviews, and the job description — to answer user queries.

⚠️ If the information is NOT found in the context, you MUST respond: "Sorry, I couldn’t find any relevant information about that."

✅ Your responses must be:
- Factual and directly supported by the context
- Specific and grounded
- Clear and concise
- Completely free of speculation or guesswork

Context:
${context}`
        },
        ...history,
        { role: 'user', content: prompt }
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Chat API error: ${response.status} - ${errText}`);
        }

        const json = await response.json();
        const modelResponse = json?.choices?.[0]?.message?.content;

        return {
            answer: modelResponse?.trim() || "⚠️ No response from the model.",
            sources: topChunks.map(chunk => ({
                label: chunk.type === 'cv' ? 'CV' :
                    chunk.type === 'review' ? 'Performance Review' :
                    chunk.type === 'jd' ? 'Job Description' :
                    chunk.source.replace(/\.\w+$/, ''), // fallback to filename without extension
                source: chunk.source,
                snippet: chunk.text.slice(0, 200).trim() + '…'
            }))
        };

    } catch (err) {
        console.error("Chat completion error:", err.message);
        return "⚠️ Error generating response. Try again later.";
    }
}

export function getStaticResponse(prompt) {
    return "🤖 Sorry, I don’t have an answer for that right now.";
}