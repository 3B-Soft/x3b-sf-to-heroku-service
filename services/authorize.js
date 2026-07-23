import axios from 'axios';

// ponytail: in-memory per-dyno token cache. TTL capped at 5 min so a server-side
// session invalidation can only serve a stale token briefly; drop the cap (use full
// expiresIn) if the auth server ever exposes revocation.
const cache = new Map(); // sessionKey -> { auth, expiresAt }
const MAX_CACHE_ENTRIES = 500;
const MAX_TTL_SECONDS = 300;

export default async function authorize({ sessionKey }) {
    const hit = cache.get(sessionKey);
    if (hit && hit.expiresAt > Date.now()) return hit.auth;
    cache.delete(sessionKey);

    const authStart = Date.now();
    const authUrl = new URL("https://auth.3b4sf.com/getToken");
    authUrl.searchParams.set("sessionKey", sessionKey);
    const auth = await axios.get(
        authUrl.toString(),
        { timeout: 10000 }
    ).then(response => {
        console.info(`✅ Authorized successfully in ${Date.now() - authStart}ms`);
        return response?.data?.responseObject;
    }).catch(err => {
        throw new Error(`Failed to authorize request: ${err?.response?.data?.message ?? err.message}`)
    });

    if (auth?.expiresIn > 90) {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        const ttlSeconds = Math.min(auth.expiresIn - 60, MAX_TTL_SECONDS);
        cache.set(sessionKey, { auth, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
    return auth;
}
