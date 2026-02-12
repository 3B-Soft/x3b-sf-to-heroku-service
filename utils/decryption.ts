import crypto from 'crypto';
import 'dotenv/config';

function getCryptoConfig() {
    const { SECRET_KEY, IV } = process.env;

    if (!SECRET_KEY) {
        throw new Error('SECRET_KEY is not defined in environment variables');
    }

    if (!IV) {
        throw new Error('IV is not defined in environment variables');
    }

    /**
     * The secret key used to encrypt the data
     * @type {Buffer}
     */
    const secretKey = Buffer.from(SECRET_KEY, 'base64');

    /**
     * The initialization vector (IV) used to encrypt the data
     * @type {Buffer}
     */
    const iv = Buffer.from(IV, 'base64');

    return {
        SECRET_KEY: secretKey,
        IV: iv,
    };
}

export function decrypt(encryptedData: string): string | null {
    try {
        const { SECRET_KEY, IV } = getCryptoConfig();

        const buffer = Buffer.from(encryptedData, 'base64');
        const decipher = crypto.createDecipheriv("aes-128-cbc", SECRET_KEY, IV);
        const decrypted = decipher.update(buffer, undefined, 'utf8') + decipher.final('utf8');

        return decrypted;
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error(`Error decrypting data: [${err.message}]`);
        } else {
            console.error('Error decrypting data:', err);
        }
        return null;
    }
}
