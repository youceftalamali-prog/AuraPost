export class Logger {
  static info(message: string, meta?: unknown) {
    console.log(
      `[INFO] ${new Date().toISOString()} - ${message}`,
      meta ?? ""
    );
  }

  static warn(message: string, meta?: unknown) {
    console.warn(
      `[WARN] ${new Date().toISOString()} - ${message}`,
      meta ?? ""
    );
  }

  static error(message: string, meta?: unknown) {
    console.error(
      `[ERROR] ${new Date().toISOString()} - ${message}`,
      meta ?? ""
    );
  }

  static debug(message: string, meta?: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[DEBUG] ${new Date().toISOString()} - ${message}`,
        meta ?? ""
      );
    }
  }
}