import express from "express";
import cors from "cors";
import Busboy from 'busboy'; // Direct import usually works for default exports
import FormData from 'form-data';

// import { getFileWithSessionKey, getFileWithSessionId } from './services/getFile.js';
// import { saveFileWithSessionKey, saveFileWithSessionId } from './services/saveFile.js';


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

const streamFileUpload = (req, res, next) => {
    console.time('streamFileUpload');
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
        return res.status(400).json({ success: false, message: 'Missing or invalid multipart/form-data content type' });
    }

    // Initialize Busboy with request headers
    const busboy = Busboy({ headers: req.headers });
    req.files = {}; // Object to hold file buffers and info

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        let fileBuffer = Buffer.alloc(0);

        // 1. Consume the file stream and buffer it in memory (FIX for the hang)
        file.on('data', (data) => {
            fileBuffer = Buffer.concat([fileBuffer, data]);
        });

        // 2. Store the file buffer and metadata upon completion
        file.on('end', () => {
            console.log(`[Busboy] File stream ended for ${fieldname}. Size: ${fileBuffer.length} bytes.`);
            req.files[fieldname] = {
                fileBuffer: fileBuffer, // Pass the buffer instead of the stream
                filename: filename.filename,
                mimetype: mimetype,
                encoding: encoding
            };
        });

        // Handle stream errors
        file.on('error', (err) => {
            console.timeEnd('streamFileUpload');
            console.error('[Busboy] File stream Error:', err);
            // It's crucial to stop processing on error
            req.unpipe(busboy);
            return res.status(500).json({ success: false, message: 'Error reading uploaded file stream.' });
        });
    });

    busboy.on('field', (fieldname, val) => {
        // MUST consume non-file fields to ensure 'finish' fires
        // If you need text fields, you would store them on req.body here
        console.log(`[Busboy] Consumed field: ${fieldname}`);
    });

    busboy.on('finish', () => {
        console.timeEnd('streamFileUpload');
        console.log('[Busboy] Finished processing all parts. Calling next().');
        next(); // Proceed to the route handler
    });

    busboy.on('error', (err) => {
        console.timeEnd('streamFileUpload');
        console.error('[Busboy] Busboy Error:', err);
        return res.status(500).json({ success: false, message: 'File upload parsing error' });
    });

    // Pipe the request into Busboy to start parsing
    req.pipe(busboy);
};

/**
 * POST method to accept file and create a ContentVersion in Salesforce
 */
app.post('/v1/fileUpload', streamFileUpload, async (req, res) => {
    console.time('fileUpload');

    // const sessionId = '00D1t000000FWLH!ASAAQGpem0uYNnuk1JsKmndBHrNIzGLl06sguItgl2iVqpWEZFjM76wDOJ3nUmH9nCHN3X8yv77c6DGQLy_xY8R4sQB5F1E2';
    // //req.headers["x-session-id"];
    // const firstPublishLocationId = req.headers["x-first-publish-location-id"];
    // const contentDocumentId = req.headers['x-content-document-id'];
    // const sfInstanceUrl = req.headers["x-salesforce-instance-url"] || "[https://login.salesforce.com](https://login.salesforce.com)";

    // // Assuming the file is sent under the field name 'file'
    // const uploadedFile = req.files['file'];

    // if (!sessionId || !uploadedFile) {
    //     return res.status(400).json({ success: false, message: 'Missing required session ID, file content, or file field name ("file").' });
    // }

    // const title = req.headers["x-title"] ?? uploadedFile.filename;
    // const pathOnClient = req.headers["x-title"] ?? uploadedFile.filename;

    // // 1. Construct the Salesforce ContentVersion Record Metadata
    // const contentVersionRecord = {
    //     Title: title,
    //     PathOnClient: pathOnClient,
    //     ContentLocation: req.headers["x-content-location"] ?? "S",
    //     Origin: req.headers["x-origin"] ?? "C",
    //     FirstPublishLocationId: !contentDocumentId ? firstPublishLocationId : null,
    //     ContentDocumentId: contentDocumentId || null
    // };

    // // 2. Construct the multipart/form-data body for Salesforce
    // const form = new FormData();

    // // Required part 1: JSON metadata, named 'json'
    // form.append('json', JSON.stringify({
    //     'entity_content': contentVersionRecord
    // }), { contentType: 'application/json' });

    // // Required part 2: File stream, named 'VersionData'
    // // This pipes the incoming stream to the outgoing request immediately
    // form.append('VersionData', uploadedFile.fileStream, {
    //     filename: uploadedFile.filename,
    //     contentType: uploadedFile.mimetype,
    // });

    // const salesforceUrl = `${sfInstanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/ContentVersion`;

    try {
        console.log('Sending to SF...')
        // 3. Send the synchronous request to Salesforce
        // const sfResponse = await axios.post(salesforceUrl, form, {
        //     headers: {
        //         ...form.getHeaders(), // Important: includes the boundary header
        //         'Authorization': `Bearer ${sessionId}`,
        //         'Accept': 'application/json',
        //     },
        //     maxContentLength: Infinity, // Allow large payloads
        //     maxBodyLength: Infinity, // Allow large payloads
        // });

        // // 4. Handle Salesforce Success Response (usually 201 Created)
        // return res.status(200).json({
        //     success: true,
        //     message: 'ContentVersion created successfully.',
        //     salesforceId: sfResponse.data.id,
        //     data: sfResponse.data
        // });

        return res.status(200).json({
            success: true,
            message: 'ContentVersion created successfully.'
        });

    } catch (error) {
        console.error('Error...', error);
        // 5. Handle Salesforce/Network Errors
        // Check if the error has a detailed response from Salesforce
        const sfError = error.response?.data ? JSON.stringify(error.response.data) : null;
        const errMessage = sfError || error.message;
        console.error('Salesforce Upload Error:', errMessage);

        // Return synchronous error status
        return res.status(500).json({
            success: false,
            message: `Salesforce Upload Failed: ${errMessage}`
        });
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


//             if (!req.headers["x-namespace"] || !req.headers["x-session-key"] || !req.headers["x-title"]) {
//                 throw new Error('Missing required headers. Provide: x-namespace, x-session-key and x-title')
//             }

//             if (!req.headers["x-first-publish-location-id"] && !req.headers["x-content-document-id"]) {
//                 throw new Error('Missing required headers. Provide:  x-first-publish-location-id or x-content-document-id')
//             }

//             console.log(`🔗 Base64 body uploaded to Heroku`);

//             const firstPublishLocationId = req.headers["x-first-publish-location-id"];
//             const contentDocumentId = req.headers['x-content-document-id'];

//             const record = {
//                 VersionData: req.body,
//                 Title: req.headers["x-title"] ?? "unknown_file_name",
//                 PathOnClient: req.headers["x-title"] ?? "unknown_file_name",
//                 ContentLocation: req.headers["x-content-location"] ?? "S",
//                 Origin: req.headers["x-origin"] ?? "C",
//                 FirstPublishLocationId: !contentDocumentId ? firstPublishLocationId : null,
//                 ContentDocumentId: contentDocumentId || null
//             };

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
//             console.warn('❌ POST RAW failed', err);
//             const errMessage = err?.response?.data?.error_description || err?.message;
//             return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
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
//             return res.status(200).json({
//                 success: true,
//                 responseObject: base64
//             });
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
