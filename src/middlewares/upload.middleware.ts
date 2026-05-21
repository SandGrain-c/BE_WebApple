// src/middlewares/upload.middleware.ts

import multer from "multer";

const storage = multer.memoryStorage();

export const uploadImageMiddleware = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and WEBP images are allowed"));
    }

    cb(null, true);
  },
});