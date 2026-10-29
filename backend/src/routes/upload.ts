import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";

import cloudinary from "../lib/cloudinary.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { PRIVATE_RECEIPTS_DIR } from "./receipts.js";

const router = Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Use memory storage to inspect the file *before* saving it to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
});

// Cloudinary Image Upload Endpoint (Protected: Admin/Manager only)
router.post("/image", authenticate, authorise("admin", "manager"), upload.single("image"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No image file uploaded" });
    return;
  }

  try {
    const fileType = await fileTypeFromBuffer(req.file.buffer);
    if (!fileType || !fileType.mime.startsWith("image/")) {
      res.status(400).json({ success: false, error: "Invalid or corrupt image file" });
      return;
    }

    if (!cloudinary.config().cloud_name) {
       res.status(500).json({ success: false, error: "Cloudinary is not configured. Add API keys to .env" });
       return;
    }

    // Wrap Cloudinary upload stream in a Promise
    const uploadToCloudinary = () => new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "asella-organic" },
        (error, result) => {
          if (result) resolve(result.secure_url);
          else reject(error);
        }
      );
      uploadStream.end(req.file!.buffer);
    });

    const secureUrl = await uploadToCloudinary();
    res.status(200).json({ success: true, data: { url: secureUrl } });

  } catch (error) {
    console.error("[Cloudinary Upload Error]:", error);
    res.status(500).json({ success: false, error: "Failed to upload image to CDN" });
  }
});

// Public on purpose: this is the customer uploading proof of payment from
// checkout (frontend OrderForm.tsx), before they have any account. Guarded by
// a dedicated per-IP budget instead of a session — see uploadRateLimit.
router.post("/receipt", uploadRateLimit, upload.single("receipt"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No file uploaded" });
    return;
  }

  try {
    // 1. Inspect "magic bytes" to guarantee verified file type
    const fileType = await fileTypeFromBuffer(req.file.buffer);
    
    if (!fileType) {
      res.status(400).json({ success: false, error: "Invalid or corrupt file: unable to determine file type" });
      return;
    }

    const ext = fileType.ext.toLowerCase();
    const mime = fileType.mime.toLowerCase();

    // Explicitly reject unsupported/problematic formats with a clear message
    const rejectedFormats = ["heic", "heif", "avif", "bmp", "tif", "tiff"];
    if (rejectedFormats.includes(ext) || rejectedFormats.some(f => mime.includes(f))) {
      const displayFormat = ext.toUpperCase();
      res.status(400).json({
        success: false,
        error: `Unsupported image format (${displayFormat}). Please upload a JPEG, PNG, or WebP image (or PDF).`
      });
      return;
    }

    // Allowed formats: jpg, jpeg, png, webp, pdf
    const allowedExtensions = ["jpg", "jpeg", "png", "webp", "pdf"];
    if (!allowedExtensions.includes(ext)) {
      res.status(400).json({
        success: false,
        error: "Invalid file type. Only JPG, PNG, WebP, and PDF files are accepted."
      });
      return;
    }

    // 2. Generate a safe filename and manually force the verified extension
    const uniqueSuffix = crypto.randomBytes(8).toString("hex") + "-" + Date.now();
    const safeFilename = `receipt-${uniqueSuffix}.${fileType.ext}`;
    const fullPath = path.join(PRIVATE_RECEIPTS_DIR, safeFilename);

    // 3. Write buffer to disk safely
    await fs.promises.writeFile(fullPath, req.file.buffer);

    // Return the authenticated receipt URL
    const fileUrl = `/api/receipts/${safeFilename}`;
    res.status(200).json({ success: true, data: { url: fileUrl } });
  } catch (error) {
    console.error("[Upload] Error processing file:", error);
    res.status(500).json({ success: false, error: "Internal server error processing upload" });
  }
});

export default router;
