/**
 * Rotates a Blob/File by the given degrees (0, 90, 180, 270).
 * Returns the original blob if rotation is 0.
 * @param {Blob} blob
 * @param {number} rotation - degrees (multiples of 90)
 * @returns {Promise<Blob>}
 */
export const rotateBlob = async (blob, rotation) => {
    if (rotation === 0) return blob;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (rotation === 90 || rotation === 270) {
                    canvas.width = img.height;
                    canvas.height = img.width;
                } else {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                canvas.toBlob(resolve, blob.type);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(blob);
    });
};

/**
 * Crops a blob based on normalized coordinates [ymin, xmin, ymax, xmax] (0-1000 scale).
 * @param {File} file
 * @param {number[]} box - [ymin, xmin, ymax, xmax]
 * @returns {Promise<File>}
 */
export const cropBlob = (file, box) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const [ymin, xmin, ymax, xmax] = box;
            const realX = (xmin / 1000) * img.width;
            const realY = (ymin / 1000) * img.height;
            const realW = ((xmax - xmin) / 1000) * img.width;
            const realH = ((ymax - ymin) / 1000) * img.height;

            canvas.width = realW;
            canvas.height = realH;

            ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);

            canvas.toBlob((blob) => {
                const finalFile = new File([blob], file.name, { type: 'image/jpeg' });
                resolve(finalFile);
            }, 'image/jpeg', 0.9);
        };
        img.onerror = reject;
    });
};
