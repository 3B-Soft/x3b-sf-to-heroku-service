import express from "express";
import cors from "cors";
import { streamFileUpload } from './services/streaming.js';

import { getStreamedFile, getFileWithSessionKey, getFileWithSessionId } from './services/getFile.js';
import { saveStreamedFile, saveFileWithSessionKey, saveFileWithSessionId } from './services/saveFile.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(
    cors({
        origin: "*",
    })
);

app.route('/health').get(async function (req, res) {
    return res.status(200).json({
        success: true,
        responseObject: null
    });
});


/**
 * POST to upload a multi-form file
 */
app.post('/v1/fileUpload', streamFileUpload, async (req, res) => {
    console.time('fileUpload');

    try {
        if (!req.headers["x-namespace"] || !req.headers["x-session-key"] || !req.headers["x-title"]) {
            throw new Error('Missing required headers. Provide: x-namespace, x-session-key and x-title')
        }

        if (!req.headers["x-first-publish-location-id"] && !req.headers["x-content-document-id"]) {
            throw new Error('Missing required headers. Provide:  x-first-publish-location-id or x-content-document-id')
        }

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


        const response = await saveStreamedFile({
            namespace: req.headers["x-namespace"],
            sessionKey: req.headers["x-session-key"],
            contentVersionRecord,
            uploadedFile
        });

        return res.status(200).json({
            ...response
        });
    } catch (err) {
        console.warn('❌ POST file failed', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    } finally {
        console.timeEnd('fileUpload');
    }
});

app.route('/v1/getFile').get(async function (req, res) {
    console.time('fileDownload');
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

        // Key Change 4: Pipe the file stream directly to the response stream
        fileStream.pipe(res);

        // Key Change 5: Handle stream errors and completion
        fileStream.on('error', (err) => {
            console.error('Stream error:', err);
            // Check if headers have already been sent before attempting to send a 500
            if (!res.headersSent) {
                return res.status(500).json({ success: false, message: "File stream failed" });
            }
        });

        // This is crucial: wait for the response stream to finish piping
        await new Promise(resolve => fileStream.on('end', resolve));

    } catch (err) {
        console.warn('❌ GET file', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        // If an error occurred BEFORE piping (e.g., auth error, initial fetch error)
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
        }
        // If an error occurred after headers were sent (less common, stream error should be handled above)
    } finally {
        // Ensure the timeEnd call is outside of the stream logic that waits for 'end'
        console.timeEnd('fileDownload');
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
