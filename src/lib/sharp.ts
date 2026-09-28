import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(2);

export default sharp;
