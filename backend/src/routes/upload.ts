import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router = Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString("hex") + "-" + Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

router.post("/receipt", upload.single("receipt"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No file uploaded" });
    return;
  }

  // Return the public URL for the uploaded file
  const fileUrl = `/uploads/${req.file.filename}`;
  res.status(200).json({ success: true, data: { url: fileUrl } });
});

export default router;
