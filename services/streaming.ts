// @ts-ignore
import Busboy from 'busboy'; // Direct import usually works for default exports
import { Request, Response, NextFunction } from 'express';

export interface UploadedFile {
    fileBuffer: Buffer;
    filename: string;
    mimetype: string;
    encoding: string;
}

export const streamFileUpload = (req: Request, res: Response, next: NextFunction): Response | void => {
    console.time('streamFileUpload');
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
        return res.status(400).json({ success: false, message: 'Missing or invalid multipart/form-data content type' });
    }

    // Initialize Busboy with request headers
    const busboy = Busboy({ headers: req.headers });
    req.files = {}; // Object to hold file buffers and info
    const files = req.files;

    busboy.on('file', (fieldname: string, file: NodeJS.ReadableStream, filename: any, encoding: string, mimetype: string) => {
        let fileBuffer = Buffer.alloc(0);

        // 1. Consume the file stream and buffer it in memory (FIX for the hang)
        file.on('data', (data: Buffer) => {
            fileBuffer = Buffer.concat([fileBuffer, data]);
        });

        // 2. Store the file buffer and metadata upon completion
        file.on('end', () => {
            console.log(`[Busboy] File stream ended for ${fieldname}. Size: ${fileBuffer.length} bytes.`);
            files[fieldname] = {
                fileBuffer: fileBuffer, // Pass the buffer instead of the stream
                filename: filename.filename,
                mimetype: mimetype,
                encoding: encoding
            };
        });

        // Handle stream errors
        file.on('error', (err: Error) => {
            console.timeEnd('streamFileUpload');
            console.error('[Busboy] File stream Error:', err);
            // It's crucial to stop processing on error
            req.unpipe(busboy);
            return res.status(500).json({ success: false, message: 'Error reading uploaded file stream.' });
        });
    });

    busboy.on('field', (fieldname: string, val: string) => {
        // MUST consume non-file fields to ensure 'finish' fires
        // If you need text fields, you would store them on req.body here
        console.log(`[Busboy] Consumed field: ${fieldname}`);
    });

    busboy.on('finish', () => {
        console.timeEnd('streamFileUpload');
        console.log('[Busboy] Finished processing all parts. Calling next().');
        next(); // Proceed to the route handler
    });

    busboy.on('error', (err: Error) => {
        console.timeEnd('streamFileUpload');
        console.error('[Busboy] Busboy Error:', err);
        return res.status(500).json({ success: false, message: 'File upload parsing error' });
    });

    // Pipe the request into Busboy to start parsing
    req.pipe(busboy);
};