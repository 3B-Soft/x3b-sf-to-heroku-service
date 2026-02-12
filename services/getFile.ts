import authorize from './authorize.js';
import { decrypt } from '../utils/decryption.js';
import axios, { AxiosError } from 'axios';
import { Readable } from 'stream';

const API_VER = 'v62.0';

type Auth = {
    sessionId: string | null;
    instanceUrl: string;
    expiresIn?: number;
};

type GetStreamedFileParams = {
    sessionKey: string;
    contentVersionId: string;
};

type GetFileWithSessionKeyParams = {
    sessionKey: string;
    contentVersionId: string;
};

type GetFileWithSessionIdParams = {
    contentVersionId: string;
    endpoint: string;
    sid: string;
};

type GetFileParams = {
    auth: Auth;
    contentVersionId: string;
};

export async function getStreamedFile({ sessionKey, contentVersionId }: GetStreamedFileParams): Promise<Readable> {
    const getFileStart = new Date().getTime();
    const auth = await authorize({ sessionKey: sessionKey });
    // const auth = {
    //     "sessionId": "00D1t000000FWLH!ASAAQGpem0uYNnuk1JsKmndBHrNIzGLl06sguItgl2iVqpWEZFjM76wDOJ3nUmH9nCHN3X8yv77c6DGQLy_xY8R4sQB5F1E2",
    //     "instanceUrl": "https://3bo-dev-ed.my.salesforce.com",
    //     "expiresIn": 2390
    // }
    const url = `${auth.instanceUrl}/services/data/${API_VER}/sobjects/ContentVersion/${contentVersionId}/VersionData`;
    return await axios.get<Readable>(
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
    }).catch((err: unknown) => {
        const error = err as AxiosError;
        console.error("Failed to fetch file from Salesforce", {
            url,
            status: error?.response?.status,
            statusText: error?.response?.statusText,
            sfError: error?.response?.data,
            message: error.message,
            stack: error.stack
        });
        throw new Error(`Failed to fetch file: ${error.message} (${error?.response?.statusText})`);
    });
}

export async function getFileWithSessionKey({ sessionKey, contentVersionId }: GetFileWithSessionKeyParams): Promise<string> {
    console.info(`Get file with Session Key [${contentVersionId}]`)
    const auth = await authorize({ sessionKey });
    return await getFile({ auth, contentVersionId });
}

export async function getFileWithSessionId({ contentVersionId, endpoint, sid }: GetFileWithSessionIdParams): Promise<string> {
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

async function getFile({ auth, contentVersionId }: GetFileParams): Promise<string> {
    const getFileStart = new Date().getTime();
    const url = `${auth.instanceUrl}/services/data/${API_VER}/sobjects/ContentVersion/${contentVersionId}/VersionData`;
    return await axios.get<ArrayBuffer>(
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
    }).catch((err: unknown) => {
        const error = err as AxiosError;
        console.error("Failed to fetch file from Salesforce", {
            url,
            status: error?.response?.status,
            statusText: error?.response?.statusText,
            sfError: error?.response?.data,
            message: error.message,
            stack: error.stack
        });
        throw new Error(`Failed to fetch file: ${error.message} (${error?.response?.statusText})`);
    });
}