import { describe, expect, it } from "vitest";
import { extractBearerToken } from "../supabase/functions/face-biometric/auth-header";

describe("face-biometric authorization header", () => {
  it("extracts a valid bearer token", () => {
    expect(extractBearerToken("Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature"))
      .toBe("eyJhbGciOiJIUzI1NiJ9.payload.signature");
  });

  it("accepts case-insensitive schemes and extra surrounding whitespace", () => {
    expect(extractBearerToken("  bearer   token-value  ")).toBe("token-value");
  });

  it("rejects a missing or unsupported authorization scheme", () => {
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("token-value")).toBeNull();
    expect(extractBearerToken("Basic token-value")).toBeNull();
  });

  it("rejects a missing token or multiple token values", () => {
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer token-one token-two")).toBeNull();
  });
});
