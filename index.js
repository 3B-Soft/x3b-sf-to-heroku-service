import express from "express";
import cors from "cors";
import path from "path";

import { fileURLToPath } from "url";
import { getFileWithSessionKey, getFileWithSessionId } from './services/getFile.js';
import { saveFileWithSessionKey, saveFileWithSessionId } from './services/saveFile.js';


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
    const { contentVersionId, endpoint, sid, sessionKey } = req.query;
    try {
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
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    }
});

/**
 * Create salesforce file synchronously
 */
app.route('/v1/file').post(async function (req, res) {
    const { namespace, record, endpoint, sid, sessionKey } = req.body;
    try {
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
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    }
});

app.route('/v1/file-async').post(async function (req, res) {
    const { namespace, record, sessionKey } = req.body;
    try {
        if (!namespace || !record || !sessionKey) {
            throw new Error('Required parameters are missing');
        }

        res.status(202).json({
            success: true,
            message: "File upload scheduled"
        });

        saveFileWithSessionKey({ sessionKey, namespace, record });
    } catch (err) {
        const errMessage = err?.response?.data?.error_description || err?.message;
        return res.status(500).json({ success: false, message: errMessage ?? "Unknown error occurred" });
    }
})

//Start the server
const server = app.listen(process.env.PORT || port, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("Great, app is listening at http://%s:%s", host, port);
});
