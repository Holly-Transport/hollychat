import { Storage } from '@google-cloud/storage';

let cachedData = null;

export async function getKnowledgeBase() {
    if (cachedData) return cachedData;

    const storage = new Storage(); // Uses GOOGLE_APPLICATION_CREDENTIALS
    const bucket = 'itsti-chat';
    const file = 'knowledge-base.json';

    const [url] = await storage
        .bucket(bucket)
        .file(file)
        .getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 10 * 60 * 1000,
        });

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load knowledge base: ' + res.statusText);

    cachedData = await res.json();
    return cachedData;
}
