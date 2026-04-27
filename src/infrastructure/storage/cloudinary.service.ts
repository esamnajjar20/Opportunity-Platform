import { cloudinary } from '../../config/cloudinary';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../core/utils/logger';

export interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format: string;
  bytes: number;
}

export type UploadFolder = 'avatars' | 'resumes' | 'documents';

export class CloudinaryService {
  async uploadFromBuffer(
    buffer: Buffer,
    folder: UploadFolder,
    filename?: string,
  ): Promise<UploadResult> {
    try {
      const result = await new Promise<{
        secure_url: string;
        public_id: string;
        width?: number;
        height?: number;
        format: string;
        bytes: number;
      }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `opportunity-platform/${folder}`,
            public_id: filename,
            resource_type: 'auto',
            transformation:
              folder === 'avatars'
                ? [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
                : undefined,
          },
          (error, result) => {
            if (error) reject(error);
            else if (result) resolve(result);
            else reject(new Error('Upload failed'));
          },
        );
        uploadStream.end(buffer);
      });

      logger.info(`File uploaded to Cloudinary: ${result.public_id}`);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      logger.error('Cloudinary upload failed:', error);
      throw new AppError('File upload failed', 500, 'UPLOAD_FAILED');
    }
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
      logger.info(`Cloudinary file deleted: ${publicId}`);
    } catch (error) {
      logger.error('Cloudinary delete failed:', error);
    }
  }

  async getSignedUrl(publicId: string, expiresIn: number = 3600): Promise<string> {
    return cloudinary.url(publicId, {
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      secure: true,
    });
  }
}
