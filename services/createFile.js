import { handleFetch } from '../utils/fetch.js';

const API_VER = 'v62.0';

export default async function ({ record, endpoint, sessionId }) {
    const url = `${endpoint}/services/data/${API_VER}/sobjects/ContentVersion`;

    const response = await handleFetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(record),
    });

    return response;
}
