import crypto from 'crypto';
import 'dotenv/config'

/**
 * The secret key used to encrypt the data
 * @type {Buffer}
 */
const SECRET_KEY = Buffer.from(process.env.SECRET_KEY, 'base64');

/**
 * The initialization vector (IV) used to encrypt the data
 * @type {Buffer}
 */
const IV = Buffer.from(process.env.IV, 'base64');

export function decrypt(encryptedData) {
    try {
        const buffer = Buffer.from(encryptedData, 'base64')
        const decipher = crypto.createDecipheriv("aes-128-cbc", SECRET_KEY, IV);
        const decrypted = decipher.update(buffer, 'base64', 'utf8') + decipher.final('utf8');

        return decrypted;
    } catch (err) {
        console.error(`Error decrypting data: [${err?.message}]`);
        return null;
    }
}
