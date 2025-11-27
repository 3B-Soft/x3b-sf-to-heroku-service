

const API_VER = 'v62.0';

export default async function ({ contentVersionId, endpoint, sessionId }) {
    console.warn(`Fetch File`, { endpoint, sessionId, contentVersionId });
    const url = `${endpoint}/services/data/${API_VER}/sobjects/ContentVersion/${contentVersionId}/VersionData`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
        }
    }).catch(err => {
        throw new Error(`Error performing fetch [${err?.message}]`);
    })

    if (!response.ok) {
        // Try to read JSON if present
        let message = `Fetch error: ${response.status}`;
        try {
            const data = await response.json();
            message += ` ${data?.[0]?.message || ''}`;
        } catch (e) {
            // Ignore JSON parsing failure
        }

        if (response.status === 401) {
            console.warn('Expired session');
        }

        throw new Error(message);
    }

    // Node-specific: get buffer directly
    const buffer = Buffer.from(await response.arrayBuffer());

    // Convert to Base64
    const base64 = buffer.toString('base64');

    return base64;
}