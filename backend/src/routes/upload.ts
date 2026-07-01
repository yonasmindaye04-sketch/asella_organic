import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";

import cloudinary from "../lib/cloudinary.js";

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

// Cloudinary Image Upload Endpoint
router.post("/image", upload.single("image"), async (req: Request, res: Response) => {
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

router.post("/receipt", upload.single("receipt"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No file uploaded" });
    return;
  }

  try {
    // 1. Inspect "magic bytes" to guarantee it is actually an image
    const fileType = await fileTypeFromBuffer(req.file.buffer);
    
    if (!fileType || !fileType.mime.startsWith("image/")) {
      res.status(400).json({ success: false, error: "Invalid or corrupt image file" });
      return;
    }

    // 2. Generate a safe filename and manually force the verified extension
    const uniqueSuffix = crypto.randomBytes(8).toString("hex") + "-" + Date.now();
    const safeFilename = `receipt-${uniqueSuffix}.${fileType.ext}`;
    const fullPath = path.join(UPLOADS_DIR, safeFilename);

    // 3. Write buffer to disk safely
    await fs.promises.writeFile(fullPath, req.file.buffer);

    // Return the public URL
    const fileUrl = `/uploads/${safeFilename}`;
    res.status(200).json({ success: true, data: { url: fileUrl } });
  } catch (error) {
    console.error("[Upload] Error processing file:", error);
    res.status(500).json({ success: false, error: "Internal server error processing upload" });
  }
});

export default router;
