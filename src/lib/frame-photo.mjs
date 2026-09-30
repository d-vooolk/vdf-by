import crypto from "node:crypto";

import { safeImagePath } from "./image-pipeline.mjs";

const FOLDER = "tipy-ramok";

export function framePhotoPath(categoryId, type, frame) {
  const hash = crypto.createHash("sha1").update(frame).digest("hex").slice(0, 10);
  return safeImagePath(`${categoryId}/${FOLDER}/${type}`, `ramka-${type}-${hash}.jpg`);
}

export function isFramePhoto(imagePath) {
  return imagePath.split("/")[1] === FOLDER;
}

export function framePhotoJpeg(sharp, frame) {
  return sharp(frame).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
}

export function withFramePhoto(images, photo) {
  const rest = images.filter((image) => image !== photo && !isFramePhoto(image));
  return rest.length ? [rest[0], photo, ...rest.slice(1)] : [photo];
}
