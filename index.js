import express from "express";
import cors from "cors";
import path from "path";

import { fileURLToPath } from "url";
import fetchFile from './services/fetchFile.js';
import createFile from './services/createFile.js';
import { decrypt } from './utils/decryption.js';


const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
    cors({
        origin: "*",
    })
);
// parse request body as JSON
app.use(express.json({ limit: "50mb" }));
// add access to directory
app.use(express.static(__dirname));



/**
 * Get a Salesforce file using contentVersion
 */
app.route('/v1/file').get(async function (req, res) {
    const { contentVersionId, endpoint, sid } = req.query;

    console.warn('GET file:', {
        endpoint,
        sid,
        contentVersionId
    });

    if (!sid || !endpoint || !contentVersionId) {
        return res
            .status(400)
            .json({ success: false, message: `Missing required parameters. Parameters required are sid, endpoint and contentVersionId` });
    }

    const sessionId = decrypt(sid)

    if (!sessionId) {
        return res
            .status(400)
            .json({ success: false, message: `Invalid sessionId for call` });
    }

    fetchFile({ contentVersionId, endpoint, sessionId }).then(base64 => {
        return res.status(200).json({
            success: true,
            responseObject: base64
        });
    }).catch(err => {
        return res
            .status(401)
            .json({ success: false, message: err.message });
    });
});

/**
 * Create salesforce file
 */
app.route('/v1/file').post(async function (req, res) {
    const { record, endpoint, sid, namespace } = req.body;

    console.warn('POST file:', {
        endpoint,
        sid,
        namespace
    });

    if (!sid || !endpoint || !record || !namespace) {
        return res
            .status(400)
            .json({ success: false, message: `Missing required parameters. Parameters required are sid, endpoint, namespace and record` });
    }

    const sessionId = decrypt(sid)

    if (!sessionId) {
        return res
            .status(400)
            .json({ success: false, message: `Invalid sessionId for call` });
    }

    createFile({ record, endpoint, sessionId, namespace }).then(base64 => {
        return res.status(200).json({
            success: true,
            responseObject: base64
        });
    }).catch(err => {
        return res
            .status(401)
            .json({ success: false, message: err.message });
    });
});

//Start the server
const server = app.listen(process.env.PORT || port, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("Great, app is listening at http://%s:%s", host, port);
});
