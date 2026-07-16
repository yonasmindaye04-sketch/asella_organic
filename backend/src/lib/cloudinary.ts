import { v2 as cloudinary } from 'cloudinary';
import { logger as log } from './logger.js';

// Configure Cloudinary using environment variables
// It expects CLOUDINARY_URL or (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string,
  });
  log.info("Cloudinary configured successfully.");
} else {
  log.warn("Cloudinary environment variables missing. Cloudinary uploads will fail.");
}

export default cloudinary;
