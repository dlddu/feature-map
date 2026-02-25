import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-production";

export interface TokenPayload {
  userId: string;
  type: "access" | "refresh";
  exp: number;
  iat: number;
}

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId, type: "access" }, JWT_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  if (!token) {
    throw new Error("Token is required");
  }
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
