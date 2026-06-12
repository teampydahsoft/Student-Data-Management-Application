import { getStaticFileUrlDirect } from '../config/api';

const MAX_PHOTO_BYTES = 1024 * 1024;

export const MAX_TICKET_PHOTO_BYTES = MAX_PHOTO_BYTES;

export const resolveTicketPhotoUrl = (photoUrl) => {
    if (!photoUrl) return '';
    if (photoUrl.startsWith('data:') || photoUrl.startsWith('http')) {
        return photoUrl;
    }
    if (photoUrl.startsWith('/uploads/')) {
        return getStaticFileUrlDirect(photoUrl.replace(/^\/uploads\//, ''));
    }
    return getStaticFileUrlDirect(photoUrl.replace(/^\/?uploads\//, ''));
};

/**
 * Compress an image file to stay under maxBytes (default 1MB).
 */
export const compressTicketPhoto = (file, maxBytes = MAX_PHOTO_BYTES) =>
    new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('Only image files are allowed'));
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Invalid image file'));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDimension = 1600;
                let { width, height } = img;

                if (width > maxDimension || height > maxDimension) {
                    const scale = Math.min(maxDimension / width, maxDimension / height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const attempt = (quality) => {
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                reject(new Error('Failed to compress image'));
                                return;
                            }
                            if (blob.size <= maxBytes || quality <= 0.35) {
                                const baseName = file.name.replace(/\.[^.]+$/, '') || 'ticket-photo';
                                resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
                                return;
                            }
                            attempt(Math.max(0.35, quality - 0.1));
                        },
                        'image/jpeg',
                        quality
                    );
                };

                attempt(0.85);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
