/**
 * Image Editor for Document Processing
 * Allows users to rotate and crop images before processing
 */

class ImageEditor {
    constructor(canvasId, previewId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.previewCanvas = document.getElementById(previewId);
        this.previewCtx = this.previewCanvas ? this.previewCanvas.getContext('2d') : null;

        this.originalImage = null;
        this.currentImage = null;
        this.rotation = 0;
        this.cropArea = null;
        this.isCropping = false;
        this.cropStart = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousedown', this.startCrop.bind(this));
        this.canvas.addEventListener('mousemove', this.updateCrop.bind(this));
        this.canvas.addEventListener('mouseup', this.endCrop.bind(this));
        this.canvas.addEventListener('mouseleave', this.endCrop.bind(this));
    }

    /**
     * Load image from file
     */
    loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.originalImage = img;
                    this.currentImage = img;
                    this.rotation = 0;
                    this.cropArea = null;
                    this.drawImage();
                    resolve(img);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Draw current image on canvas
     */
    drawImage() {
        if (!this.currentImage) return;

        const img = this.currentImage;

        // Calculate canvas size based on rotation
        if (this.rotation === 90 || this.rotation === 270) {
            this.canvas.width = img.height;
            this.canvas.height = img.width;
        } else {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        // Apply rotation
        if (this.rotation !== 0) {
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            this.ctx.translate(centerX, centerY);
            this.ctx.rotate((this.rotation * Math.PI) / 180);
            this.ctx.translate(-img.width / 2, -img.height / 2);
            this.ctx.drawImage(img, 0, 0);
        } else {
            this.ctx.drawImage(img, 0, 0);
        }

        this.ctx.restore();

        // Draw crop area if exists
        if (this.cropArea) {
            this.drawCropArea();
        }
    }

    /**
     * Rotate image
     */
    rotate(degrees) {
        this.rotation = (this.rotation + degrees) % 360;
        if (this.rotation < 0) this.rotation += 360;
        this.cropArea = null; // Reset crop when rotating
        this.drawImage();
    }

    /**
     * Reset all transformations
     */
    reset() {
        this.currentImage = this.originalImage;
        this.rotation = 0;
        this.cropArea = null;
        this.drawImage();
    }

    /**
     * Start cropping
     */
    startCrop(e) {
        if (!this.currentImage) return;

        const rect = this.canvas.getBoundingClientRect();
        this.isCropping = true;
        this.cropStart = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.cropArea = null;
    }

    /**
     * Update crop area
     */
    updateCrop(e) {
        if (!this.isCropping || !this.cropStart) return;

        const rect = this.canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        this.cropArea = {
            x: Math.min(this.cropStart.x, currentX),
            y: Math.min(this.cropStart.y, currentY),
            width: Math.abs(currentX - this.cropStart.x),
            height: Math.abs(currentY - this.cropStart.y)
        };

        this.drawImage();
    }

    /**
     * End cropping
     */
    endCrop() {
        this.isCropping = false;
        this.cropStart = null;
    }

    /**
     * Draw crop area rectangle
     */
    drawCropArea() {
        if (!this.cropArea) return;

        this.ctx.strokeStyle = '#4CAF50';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(
            this.cropArea.x,
            this.cropArea.y,
            this.cropArea.width,
            this.cropArea.height
        );
        this.ctx.setLineDash([]);

        // Semi-transparent overlay outside crop area
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.cropArea.y);
        this.ctx.fillRect(0, this.cropArea.y, this.cropArea.x, this.cropArea.height);
        this.ctx.fillRect(
            this.cropArea.x + this.cropArea.width,
            this.cropArea.y,
            this.canvas.width - this.cropArea.x - this.cropArea.width,
            this.cropArea.height
        );
        this.ctx.fillRect(
            0,
            this.cropArea.y + this.cropArea.height,
            this.canvas.width,
            this.canvas.height - this.cropArea.y - this.cropArea.height
        );
    }

    /**
     * Apply crop
     */
    applyCrop() {
        if (!this.cropArea || !this.currentImage) return;

        // Create new canvas for cropped image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        tempCanvas.width = this.cropArea.width;
        tempCanvas.height = this.cropArea.height;

        // Draw cropped portion
        tempCtx.drawImage(
            this.canvas,
            this.cropArea.x,
            this.cropArea.y,
            this.cropArea.width,
            this.cropArea.height,
            0,
            0,
            this.cropArea.width,
            this.cropArea.height
        );

        // Convert to image
        const img = new Image();
        img.onload = () => {
            this.currentImage = img;
            this.cropArea = null;
            this.drawImage();
        };
        img.src = tempCanvas.toDataURL('image/jpeg', 0.95);
    }

    /**
     * Get edited image as Blob
     */
    getBlob() {
        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.95);
        });
    }

    /**
     * Get edited image as File
     */
    async getFile(filename = 'edited-image.jpg') {
        const blob = await this.getBlob();
        return new File([blob], filename, { type: 'image/jpeg' });
    }

    /**
     * Clear canvas
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.originalImage = null;
        this.currentImage = null;
        this.rotation = 0;
        this.cropArea = null;
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.ImageEditor = ImageEditor;
}
