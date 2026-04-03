import { NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/types";

/**
 * Helper to create a consistent JSON success response.
 */
export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Helper to create a consistent JSON error response.
 */
export function errorResponse(error: string, status = 500): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error }, { status });
}
