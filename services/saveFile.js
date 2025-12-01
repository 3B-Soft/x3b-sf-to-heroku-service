import authorize from './authorize.js';
import { decrypt } from '../utils/decryption.js';
import axios from 'axios';

const API_VER = 'v62.0';

export async function saveFileWithSessionKey({ sessionKey, namespace, record }) {
    console.info(`saveFileWithSessionKey [${sessionKey} - ${namespace} - ${record?.Title}]`);
    const auth = await authorize({ sessionKey });
    return await saveFile({
        auth,
        namespace,
        record
    });
}

export async function saveFileWithSessionId({ sid, endpoint, namespace, record }) {
    console.info(`saveFileWithSessionKey [${sid} - ${namespace} - ${record?.Title}]`);
    const sessionId = decrypt(sid);
    return await saveFile({
        auth: {
            sessionId,
            instanceUrl: endpoint
        },
        namespace,
        record
    });
}

async function saveFile({ auth, namespace, record }) {
    const url = `${auth.instanceUrl}/services/data/${API_VER}/sobjects/ContentVersion`;
    return await axios.post(
        url,
        record,
        {
            headers: {
                'Authorization': `Bearer ${auth.sessionId}`
            }
        }
    ).then(async response => {
        console.info(`✅ Saved file [${response?.data?.id}] successfully`);
        if (record.FirstPublishLocationId) {
            await shareFile({ auth, namespace, contentVersionId: response?.data?.id, linkedEntityId: record.FirstPublishLocationId });
            console.info(`✅ Shared file [${response?.data?.id} - ${record?.FirstPublishLocationId}] successfully`);
        }
        return {
            success: true,
            id: response.data.id,
            ...response.data
        }
    }).catch(err => {
        console.error("Failed to save file to Salesforce", {
            url,
            status: err?.response?.status,
            statusText: err?.response?.statusText,
            sfError: err?.response?.data,
            message: err.message,
            stack: err.stack
        });
        throw new Error(`Failed to save file: ${err.message} (${err?.response?.statusText})`);
    });
}

async function shareFile({ auth, namespace, contentVersionId, linkedEntityId }) {
    return await axios.post(
        `${auth.instanceUrl}/services/apexrest/${namespace}/GlobalRemotingRouter/`,
        {
            controllerName: `${namespace}.Shared`,
            endp: 'shareFile',
            contentVersionId: contentVersionId,
            linkedEntityId: linkedEntityId
        },
        {
            headers: {
                'Authorization': `Bearer ${auth.sessionId}`
            }
        }
    );
}