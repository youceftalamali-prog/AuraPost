import { ApiResponse } from "./ApiResponse";

export class ResponseBuilder {
  static success<T>(
    data: T,
    message = "Success"
  ): ApiResponse<T> {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static error(
    message = "Error",
    errors?: unknown
  ): ApiResponse {
    return {
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString(),
    };
  }
}