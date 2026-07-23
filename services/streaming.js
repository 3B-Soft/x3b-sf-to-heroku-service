import Busboy from 'busboy';

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 100;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export const streamFileUpload = (req, res, next) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
        return res.status(400).json({ success: false, message: 'Missing or invalid multipart/form-data content type' });
    }

    let busboy;
    try {
        busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_SIZE } });
    } catch (err) {
        return res.status(400).json({ success: false, message: `Malformed multipart request: ${err.message}` });
    }

    req.files = {};
    let settled = false;

    const fail = (status, message) => {
        if (settled) return;
        settled = true;
        req.unpipe(busboy);
        busboy.destroy();
        req.resume(); // drain the rest of the body so the client isn't left hanging
        if (!res.headersSent) res.status(status).json({ success: false, message });
    };

    // busboy 1.x signature: (name, stream, info) — NOT the 0.x positional (name, stream, filename, encoding, mimetype)
    busboy.on('file', (fieldname, file, info) => {
        // ponytail: one in-memory copy of the file. True stream-through to Salesforce
        // needs a known length (e.g. a client-sent x-file-size header) — add when files
        // outgrow dyno RAM.
        const chunks = [];
        file.on('data', (data) => chunks.push(data));
        file.on('limit', () => fail(413, `File exceeds the ${MAX_FILE_SIZE_MB}MB limit`));
        file.on('end', () => {
            if (settled) return;
            req.files[fieldname] = {
                fileBuffer: Buffer.concat(chunks),
                filename: info.filename,
                mimetype: info.mimeType,
                encoding: info.encoding
            };
        });
        file.on('error', (err) => {
            console.error('[Busboy] File stream error:', err);
            fail(500, 'Error reading uploaded file stream.');
        });
    });

    busboy.on('finish', () => {
        if (settled) return;
        settled = true;
        next();
    });

    busboy.on('error', (err) => {
        console.error('[Busboy] Error:', err);
        fail(500, 'File upload parsing error');
    });

    // Client hung up mid-upload: busboy never emits 'finish', so the request would
    // hang until the router kills it (H28) while the buffered file leaks. Tear down instead.
    res.on('close', () => {
        if (!res.writableFinished) {
            settled = true;
            req.unpipe(busboy);
            busboy.destroy();
        }
    });

    req.pipe(busboy);
};
