import Busboy from 'busboy'; // Direct import usually works for default exports

export const streamFileUpload = (req, res, next) => {
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