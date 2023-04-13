import { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";

export const hash = (value: string, algo?: string) => {
  const hmac = createHash(algo || "sha256");
  hmac.update(value);
  return hmac.digest("hex");
};