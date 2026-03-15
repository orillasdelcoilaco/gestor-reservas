const { v4: uuidv4 } = require('uuid');
const path = require('path');

class StorageService {
    constructor(bucket) {
        this.bucket = bucket;
    }

    async uploadFile(buffer, originalName, folder = 'vehicle-docs') {
        const ext = path.extname(originalName);
        const filename = `${uuidv4()}${ext}`;
        const destination = `${folder}/${filename}`;
        const file = this.bucket.file(destination);

        await file.save(buffer, {
            contentType: 'application/octet-stream', // Could detect mime type
            resumable: false
        });

        return {
            path: destination,
            filename: originalName
        };
    }

    async getSignedUrl(filePath) {
        const file = this.bucket.file(filePath);
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60, // 1 hour
        });
        return url;
    }

    async deleteFile(filePath) {
        const file = this.bucket.file(filePath);
        await file.delete().catch(err => {
            console.warn(`Failed to delete file ${filePath}:`, err.message);
        });
    }
}

module.exports = (bucket) => new StorageService(bucket);
