import express from "express";
import cors from "cors";
import { pipeline } from "node:stream/promises";
import { streamFileUpload } from './services/streaming.js';

import authorize from './services/authorize.js';
import { getStreamedFile, getFileWithSessionKey, getFileWithSessionId } from './services/getFile.js';
import { saveStreamedFile, saveFileWithSessionKey, saveFileWithSessionId } from './services/saveFile.js';
import { createLogger } from './observability/client.js';

const app = express();
const port = process.env.PORT || 3000;

// Observability — ships request logs + heartbeats to the central log service.
const logger = createLogger({ service: 'x3b-sf-to-heroku', kind: 'web' });

app.use(
    cors({
        origin: "*",
    })
);
// log every request (memory-safe, fire-and-forget)
app.use(logger.middleware);

app.route('/health').get(async function (req, res) {
    return res.status(200).json({
        success: true,
        responseObject: null
    });
});


/**
 * POST to upload a multi-form file
 */
app.post('/v1/fileUpload', (req, res, next) => {
    // Validate headers BEFORE parsing the body — no point buffering a file we'll reject.
    if (!req.headers["x-namespace"] || !req.headers["x-session-key"] || !req.headers["x-title"]) {
        return res.status(400).json({ success: false, message: 'Missing required headers. Provide: x-namespace, x-session-key and x-title' });
    }
    if (!req.headers["x-first-publish-location-id"] && !req.headers["x-content-document-id"]) {
        return res.status(400).json({ success: false, message: 'Missing required headers. Provide: x-first-publish-location-id or x-content-document-id' });
    }
    // Start the auth roundtrip while the upload body is still arriving — it's off the
    // critical path by the time the file is parsed.
    req.authPromise = authorize({ sessionKey: req.headers["x-session-key"] });
    req.authPromise.catch(() => { }); // awaited in the handler; this only prevents an unhandled rejection
    next();
}, streamFileUpload, async (req, res) => {
    const uploadStart = Date.now();

    try {
        // Assuming the file is sent under the field name 'file'
        const uploadedFile = req.files['file'];
        if (!uploadedFile || !uploadedFile.fileBuffer) {
            throw new Error('Missing required file content, or file field name ("file").');
        }

        const firstPublishLocationId = req.headers["x-first-publish-location-id"];
        const contentDocumentId = req.headers['x-content-document-id'];
        const contentVersionRecord = {
            Title: req.headers["x-title"] ?? "unknown_file_name",
            PathOnClient: req.headers["x-title"] ?? "unknown_file_name",
            ContentLocation: req.headers["x-content-location"] ?? "S",
            Origin: req.headers["x-origin"] ?? "C",
            FirstPublishLocationId: !contentDocumentId ? firstPublishLocationId : null,
            ContentDocumentId: contentDocumentId || null
        };


        const auth = await req.authPromise;
        const response = await saveStreamedFile({
            namespace: req.headers["x-namespace"],
            auth,
            contentVersionRecord,
            uploadedFile
        });

        console.info(`fileUpload completed in ${Date.now() - uploadStart}ms`);
        return res.status(200).json({
            ...response
        });
    } catch (err) {
        console.warn('❌ POST file failed', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    }
});

app.route('/v1/getFile').get(async function (req, res) {
    const downloadStart = Date.now();
    let fileStream;
    try {
        const { contentVersionId, sessionKey } = req.query;

        if (!contentVersionId || !sessionKey) {
            throw new Error('Missing required parameters. Provide: contentVersionId and sessionKey')
        }

        // Assuming your getFileWithSessionKey calls getFile and handles auth/session.
        // It now must return the stream object, not the Base64 string.
        fileStream = await getStreamedFile({ sessionKey, contentVersionId });

        // Key Change 3: Set appropriate headers for file download
        // You'll need to know the file's MIME type and name. 
        // If Salesforce doesn't provide it easily, you might need an extra API call or 
        // hardcode for common types. For now, let's assume a generic stream.

        // Salesforce's VersionData endpoint often returns the Content-Type header.
        // We can forward it from the axios response (the 'data' is the stream, headers are on the response).
        // If getFileWithSessionKey handles the axios call, you need to ensure it forwards the headers.

        // If 'getFile' is called directly and returns the stream as above:
        // You will typically need the full axios response object to get headers like 'content-type'. 
        // For simplicity, let's assume you've modified getFileWithSessionKey to pass headers or the full response.

        // Simplified approach assuming the stream carries necessary info or headers are set generically:
        res.setHeader('Content-Type', 'application/octet-stream'); // General binary file type
        // res.setHeader('Content-Disposition', `attachment; filename="downloaded_file"`); // Forces download prompt

        // pipeline() destroys the Salesforce stream if the client disconnects mid-download.
        // A bare .pipe() keeps pumping into a dead socket → H27 and a leaked upstream connection.
        await pipeline(fileStream, res);

    } catch (err) {
        // Client hung up mid-download: nothing to report, just make sure the upstream is torn down.
        if (err?.code === 'ERR_STREAM_PREMATURE_CLOSE' || req.destroyed) {
            fileStream?.destroy();
            return;
        }
        console.warn('❌ GET file', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        // If an error occurred BEFORE piping (e.g., auth error, initial fetch error)
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
        }
        // If an error occurred after headers were sent (less common, stream error should be handled above)
    } finally {
        console.info(`fileDownload completed in ${Date.now() - downloadStart}ms`);
    }
})

/**
 * OLD
 */
app.route('/v1/file').get(async function (req, res) {
    try {

        const { contentVersionId, endpoint, sid, sessionKey } = req.query;
        if (!!contentVersionId && !!sessionKey) {
            const base64 = await getFileWithSessionKey({ sessionKey, contentVersionId });
            return res.status(200).json({
                success: true,
                responseObject: base64
            });
        } if (!!sid && !!endpoint && !!contentVersionId) {
            const base64 = await getFileWithSessionId({ sid, endpoint, contentVersionId });
            return res.status(200).json({
                success: true,
                responseObject: base64
            });
        } else {
            throw new Error('Missing required parameters');
        }
    } catch (err) {
        console.warn('❌ GET failed', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    }
});

/**
 * TO DEPRECATE - USE MULTIFORM
 */
app.route('/v1/file').post(express.json({ limit: "50mb" }), async function (req, res) {
    try {
        const { namespace, record, endpoint, sid, sessionKey } = req.body;
        if (!namespace || !record || (!sid && !sessionKey)) {
            throw new Error('Required parameters are missing');
        }

        if (!!sessionKey) {
            const response = await saveFileWithSessionKey({ sessionKey, namespace, record });
            return res.status(200).json({
                success: true,
                responseObject: response
            });
        } else {
            const response = await saveFileWithSessionId({ sid, endpoint, namespace, record });
            return res.status(200).json({
                success: true,
                responseObject: response
            });
        }
    } catch (err) {
        console.warn('❌ POST file (old)', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    }
});


//Start the server
const server = app.listen(process.env.PORT || port, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("Great, app is listening at http://%s:%s", host, port);
});

// Node's 5s default races the Heroku router's connection reuse: the dyno closes a
// keep-alive socket the router is about to send on → H27. Must exceed the router's 90s.
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
