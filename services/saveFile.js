import authorize from './authorize.js';
import { decrypt } from '../utils/decryption.js';
import axios from 'axios';

const API_VER = 'v62.0';

export async function saveFileWithSessionKey({ sessionKey, namespace, record }) {
    console.info(`Save file with Session Key [${sessionKey} - ${namespace} - ${record?.Title}]`);
    console.time('Authorization');
    const auth = await authorize({ sessionKey });
    console.timeEnd('Authorization');
    return await saveFile({
        auth,
        namespace,
        record
    });
}

export async function saveFileWithSessionId({ sid, endpoint, namespace, record }) {
    console.info(`Save file with Session Id [${sid} - ${namespace} - ${record?.Title}]`);
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
    const saveFileStart = new Date().getTime();
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
        console.info(`✅ Saved file [${response?.data?.id}] successfully ${new Date().getTime() - saveFileStart}ms`);
        if (record.FirstPublishLocationId) {
            await shareFile({ auth, namespace, contentVersionId: response?.data?.id, linkedEntityId: record.FirstPublishLocationId });
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
    const shareStart = new Date().getTime();
    await axios.post(
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
    ).then(() => {
        console.info(`✅ Shared file [${contentVersionId} - ${linkedEntityId}] successfully in  ${new Date().getTime() - shareStart}ms`);
    });
}