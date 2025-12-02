import authorize from './authorize.js';
import { decrypt } from '../utils/decryption.js';
import axios from 'axios';

const API_VER = 'v62.0';

export async function getStreamedFile({ sessionKey, contentVersionId }) {
    const getFileStart = new Date().getTime();
    const auth = await authorize({ sessionKey: sessionKey });
    // const auth = {
    //     "sessionId": "00D1t000000FWLH!ASAAQGpem0uYNnuk1JsKmndBHrNIzGLl06sguItgl2iVqpWEZFjM76wDOJ3nUmH9nCHN3X8yv77c6DGQLy_xY8R4sQB5F1E2",
    //     "instanceUrl": "https://3bo-dev-ed.my.salesforce.com",
    //     "expiresIn": 2390
    // }
    const url = `${auth.instanceUrl}/services/data/${API_VER}/sobjects/ContentVersion/${contentVersionId}/VersionData`;
    return await axios.get(
        url,
        {
            responseType: "stream",
            headers: {
                'Authorization': `Bearer ${auth.sessionId}`
            }
        }
    ).then(response => {
        console.info(`✅ Retreived File [${contentVersionId}] successfully in ${new Date().getTime() - getFileStart}ms`, response);
        return response.data;
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

export async function getFileWithSessionKey({ sessionKey, contentVersionId }) {
    console.info(`Get file with Session Key [${contentVersionId}]`)
    const auth = await authorize({ sessionKey });
    return await getFile({ auth, contentVersionId });
}

export async function getFileWithSessionId({ contentVersionId, endpoint, sid }) {
    console.info(`Get file with Session Id [${contentVersionId}]`, {
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
    const getFileStart = new Date().getTime();
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
        console.info(`✅ Retreived File [${contentVersionId}] successfully in ${new Date().getTime() - getFileStart}ms`);
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