import authorize from './authorize.js';
import { decrypt } from '../utils/decryption.js';
import axios from 'axios';

const API_VER = 'v62.0';

export async function getFileWithSessionKey({ sessionKey, contentVersionId }) {
    console.info(`getFileWithSessionKey [${contentVersionId}]`)
    const auth = await authorize({ sessionKey });
    return await getFile({ auth, contentVersionId });
}

export async function getFileWithSessionId({ contentVersionId, endpoint, sid }) {
    console.info(`getFileWithSessionId [${contentVersionId}]`, {
        contentVersionId, endpoint, sid
    })
    const sessionId = decrypt(sid);
    return await getFile({
        auth: {
            sessionId,
            instanceUrl: endpoint
        }, contentVersionId
    });
}

async function getFile({ auth, contentVersionId }) {
    const url = `${auth.instanceUrl}/services/data/${API_VER}/sobjects/ContentVersion/${contentVersionId}/VersionData`;
    return await axios.get(
        url,
        {
            responseType: "arraybuffer",
            headers: {
                'Authorization': `Bearer ${auth.sessionId}`
            }
        }
    ).then(response => {
        console.info(`✅ Retreived File [${contentVersionId}] successfully`);
        return Buffer.from(response.data).toString("base64");
    }).catch(err => {
        console.error("Failed to fetch file from Salesforce", {
            url,
            status: err?.response?.status,
            statusText: err?.response?.statusText,
            sfError: err?.response?.data,
            message: err.message,
            stack: err.stack
        });
        throw new Error(`Failed to fetch file: ${err.message} (${err?.response?.statusText})`);
    });
}