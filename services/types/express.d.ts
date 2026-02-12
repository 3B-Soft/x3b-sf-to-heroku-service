import { UploadedFile } from "../streaming.ts";

declare global {
  namespace Express {
    interface Request {
      files?: Record<string, UploadedFile>;
    }
  }
}
