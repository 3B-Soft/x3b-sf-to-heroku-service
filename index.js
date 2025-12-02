import express from "express";
import cors from "cors";
import { streamFileUpload } from './services/streaming.js';

// import { getFileWithSessionKey, getFileWithSessionId } from './services/getFile.js';
// import { saveFileWithSessionKey, saveFileWithSessionId } from './services/saveFile.js';
import { saveStreamedFile } from './services/saveFile.js';

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
 * POST method to accept file and create a ContentVersion in Salesforce
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
        console.warn('❌ File upload failed', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    } finally {
        console.timeEnd('fileUpload');
    }
});

// /**
//  * Upload a file 
//  * - Body of request should be base64
//  */
// app.post(
//     '/v1/base64',
//     express.text({ type: "text/*", limit: "300mb" }),
//     async (req, res) => {
//         console.time('TotalRequest');
//         try {
//             if (!req.body || typeof req.body !== 'string') {
//                 throw new Error("Missing Base64 body string");
//             }


// if (!req.headers["x-namespace"] || !req.headers["x-session-key"] || !req.headers["x-title"]) {
//     throw new Error('Missing required headers. Provide: x-namespace, x-session-key and x-title')
// }

// if (!req.headers["x-first-publish-location-id"] && !req.headers["x-content-document-id"]) {
//     throw new Error('Missing required headers. Provide:  x-first-publish-location-id or x-content-document-id')
// }

//             console.log(`🔗 Base64 body uploaded to Heroku`);

// const firstPublishLocationId = req.headers["x-first-publish-location-id"];
// const contentDocumentId = req.headers['x-content-document-id'];

// const record = {
//     VersionData: req.body,
//     Title: req.headers["x-title"] ?? "unknown_file_name",
//     PathOnClient: req.headers["x-title"] ?? "unknown_file_name",
//     ContentLocation: req.headers["x-content-location"] ?? "S",
//     Origin: req.headers["x-origin"] ?? "C",
//     FirstPublishLocationId: !contentDocumentId ? firstPublishLocationId : null,
//     ContentDocumentId: contentDocumentId || null
// };

//             console.time('UpstreamUpload');
//             const response = await saveFileWithSessionKey({
//                 sessionKey: req.headers["x-session-key"],
//                 namespace: req.headers["x-namespace"],
//                 record
//             });
//             console.timeEnd('UpstreamUpload');

//             return res.status(200).json({
//                 success: true,
//                 responseObject: response
//             });
//         } catch (err) {
// console.warn('❌ POST RAW failed', err);
// const errMessage = err?.response?.data?.error_description || err?.message;
// return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
//         } finally {
//             console.timeEnd('TotalRequest');
//         }
//     }
// );

// /**
//  * Get a Salesforce file using contentVersion
//  */
// app.route('/v1/file').get(async function (req, res) {
//     try {

//         const { contentVersionId, endpoint, sid, sessionKey } = req.query;
//         if (!!contentVersionId && !!sessionKey) {
//             const base64 = await getFileWithSessionKey({ sessionKey, contentVersionId });
//             return res.status(200).json({
//                 success: true,
//                 responseObject: base64
//             });
//         } if (!!sid && !!endpoint && !!contentVersionId) {
//             const base64 = await getFileWithSessionId({ sid, endpoint, contentVersionId });
// return res.status(200).json({
//     success: true,
//     responseObject: base64
// });
//         } else {
//             throw new Error('Missing required parameters');
//         }
//     } catch (err) {
//         console.warn('❌ GET failed', err);
//         const errMessage = err?.response?.data?.error_description || err?.message;
//         return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
//     }
// });

// /**
//  * Save file with JSON body - to deprecate
//  */
// app.route('/v1/file').post(express.json({ limit: "50mb" }), async function (req, res) {
//     try {
//         const { namespace, record, endpoint, sid, sessionKey } = req.body;
//         if (!namespace || !record || (!sid && !sessionKey)) {
//             throw new Error('Required parameters are missing');
//         }

//         if (!!sessionKey) {
//             const response = await saveFileWithSessionKey({ sessionKey, namespace, record });
//             return res.status(200).json({
//                 success: true,
//                 responseObject: response
//             });
//         } else {
//             const response = await saveFileWithSessionId({ sid, endpoint, namespace, record });
//             return res.status(200).json({
//                 success: true,
//                 responseObject: response
//             });
//         }
//     } catch (err) {
//         console.warn('❌ POST JSON failed', err);
//         const errMessage = err?.response?.data?.error_description || err?.message;
//         return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
//     }
// });


//Start the server
const server = app.listen(process.env.PORT || port, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("Great, app is listening at http://%s:%s", host, port);
});
