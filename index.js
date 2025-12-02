import express from "express";
import cors from "cors";
import { getFileWithSessionKey, getFileWithSessionId } from './services/getFile.js';
import { saveFileWithSessionKey, saveFileWithSessionId } from './services/saveFile.js';


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
 * Get a Salesforce file using contentVersion
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
 * Save file with JSON body - to deprecate
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
        console.warn('❌ POST JSON failed', err);
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    }
});


app.post("/v1/rawFile", async (req, res) => {
    const requestStart = new Date().getTime();
    try {
        if (!req.headers["x-namespace"] || !req.headers["x-session-key"] || !req.headers["x-title"]) {
            throw new Error('Missing required headers. Provide: x-namespace, x-session-key and x-title')
        }

        if (!req.headers["x-first-publish-location-id"] && !req.headers["x-content-document-id"]) {
            throw new Error('Missing required headers. Provide:  x-first-publish-location-id or x-content-document-id')
        }

    } catch (err) {
        console.warn('❌ POST RAW rejected', err);
        return res.status(500).json({ success: false, message: err?.message ?? "Unknown error occurred" });
    }

    // CHANGE 1: Set encoding to utf8. 
    // This tells Node to treat incoming data as a string, not a binary Buffer.
    req.setEncoding('utf8');

    let body = ''; // Use a string instead of an array of Buffers

    req.on("data", chunk => {
        // CHANGE 2: Simple string concatenation is often faster/lighter than Buffer.concat for this specific use case
        body += chunk;
    });

    req.on("end", async () => {
        try {
            console.log(`🔗 Raw text body uploaded to Heroku in ${new Date().getTime() - requestStart}ms`);

            // CHANGE 3: The 'body' is already the Base64 string we need. 
            // We NO LONGER need body.toString("base64") or Buffer.concat().

            const firstPublishLocationId = req.headers["x-first-publish-location-id"];
            const contentDocumentId = req.headers['x-content-document-id'];

            const record = {
                VersionData: body, // Pass the string directly
                Title: req.headers["x-title"] ?? "unknown_file_name",
                PathOnClient: req.headers["x-title"] ?? "unknown_file_name",
                ContentLocation: req.headers["x-content-location"] ?? "S",
                Origin: req.headers["x-origin"] ?? "C",
                FirstPublishLocationId: !contentDocumentId ? firstPublishLocationId : null,
                ContentDocumentId: contentDocumentId || null
            };

            const response = await saveFileWithSessionKey({
                sessionKey: req.headers["x-session-key"],
                namespace: req.headers["x-namespace"],
                record
            });

            return res.status(200).json({
                success: true,
                responseObject: response
            });

        } catch (err) {
            console.warn('❌ POST RAW failed', err);
            const errMessage = err?.response?.data?.error_description || err?.message;
            return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
        }
    });
});
/**
 * Create salesforce file synchronously
 */
//2
// app.post("/v1/rawFile", async (req, res) => {
//     const requestStart = new Date().getTime();
// try {
//     if (!req.headers["x-namespace"] || !req.headers["x-session-key"] || !req.headers["x-title"]) {
//         throw new Error('Missing required headers. Provide: x-namespace, x-session-key and x-title')
//     }

//     if (!req.headers["x-first-publish-location-id"] && !req.headers["x-content-document-id"]) {
//         throw new Error('Missing required headers. Provide:  x-first-publish-location-id or x-content-document-id')
//     }

// } catch (err) {
//     console.warn('❌ POST RAW rejected', err);
//     return res.status(500).json({ success: false, message: err?.message ?? "Unknown error occurred" });
// }

//     const chunks = [];
//     req.on("data", chunk => chunks.push(chunk));
//     req.on("end", async () => {
//         try {
//             console.log(`🔗 Raw file uploaded to Heroku in ${new Date().getTime() - requestStart}ms`);
//             const body = Buffer.concat(chunks);
//             const firstPublishLocationId = req.headers["x-first-publish-location-id"];
//             const contentDocumentId = req.headers['x-content-document-id'];

//             const record = {
//                 VersionData: body.toString("base64"),
//                 Title: req.headers["x-title"] ?? "unknown_file_name",
//                 PathOnClient: req.headers["x-title"] ?? "unknown_file_name",
//                 ContentLocation: req.headers["x-content-location"] ?? "S",
//                 Origin: req.headers["x-origin"] ?? "C",
//                 FirstPublishLocationId: !contentDocumentId ? firstPublishLocationId : null,
//                 ContentDocumentId: contentDocumentId || null
//             };

//             const response = await saveFileWithSessionKey({
//                 sessionKey: req.headers["x-session-key"],
//                 namespace: req.headers["x-namespace"],
//                 record
//             });

//             return res.status(200).json({
//                 success: true,
//                 responseObject: response
//             });

//         } catch (err) {
// console.warn('❌ POST RAW failed', err);
// const errMessage = err?.response?.data?.error_description || err?.message;
// return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
//         }
//     });
// });

//1
// app.route('/v1/rawFile').post(express.raw({ type: "*/*", limit: "50mb" }), async function (req, res) {
//     try {
//         const firstPublishLocationId = req.headers["x-first-publish-location-id"];
//         const contentDocumentId = req.headers['x-content-document-id'];

//         if (!req.headers["x-namespace"] || !req.headers["x-session-key"] || !req.headers["x-title"]) {
//             throw new Error('Missing required headers. Provide: x-namespace, x-session-key and x-title')
//         }

//         if (!firstPublishLocationId && !contentDocumentId) {
//             throw new Error('Missing required headers. Provide:  x-first-publish-location-id or x-content-document-id')
//         }

//         if (!req.body) {
//             throw new Error('Missing body for request. Expected content type is application/octet-stream');
//         }
//         // Build record for Salesforce ContentVersion
//         const record = {
//             VersionData: req.body.toString("base64"),
//             Title: req.headers["x-title"] ?? "unknown_file_name",
//             PathOnClient: req.headers["x-title"] ?? "unknown_file_name",
//             ContentLocation: req.headers["x-content-location"] ?? "S",
//             Origin: req.headers["x-origin"] ?? "C",
//             FirstPublishLocationId: !contentDocumentId ? firstPublishLocationId : null,
//             ContentDocumentId: contentDocumentId || null
//         };
//         const response = await saveFileWithSessionKey({
//             sessionKey: req.headers["x-session-key"],
//             namespace: req.headers["x-namespace"],
//             record
//         });

//         return res.status(200).json({
//             success: true,
//             responseObject: response
//         });
//         return res.status(200).json({
//             success: true,
//             responseObject: ''
//         });
//     } catch (err) {
//         console.warn('❌ POST RAW failed', err);
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
