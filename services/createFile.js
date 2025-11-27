import { handleFetch } from '../utils/fetch.js';

const API_VER = 'v62.0';

export default async function ({ record, endpoint, sessionId, namespace }) {
    const url = `${endpoint}/services/data/${API_VER}/sobjects/ContentVersion`;

    const response = await handleFetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(record),
    });

    console.log('Create file response', response);
    if (response.success && record.FirstPublishLocationId) {
        const shareResponse = await handleFetch(`${endpoint}/services/apexrest/${namespace}/GlobalRemotingRouter/`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${sessionId}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                controllerName: `${namespace}.Shared`,
                endp: 'shareFile',
                contentVersionId: response.id,
                linkedEntityId: record.FirstPublishLocationId
            }),
        }).then(res => JSON.parse(res));
        console.log('Shhare File Response', shareResponse)
        if (!shareResponse.success) {
            console.error('Failed to share file', shareResponse);
        }
    }

    return response;
}
