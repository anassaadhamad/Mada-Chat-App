/**
 * ZEGOCLOUD token04 (server-side). Vendored from
 * https://github.com/ZEGOCLOUD/zego_server_assistant/blob/master/token/nodejs/server/zegoServerAssistant.ts
 * (AES-CBC token; no browser APIs).
 */

import { createCipheriv } from "node:crypto";

function rndNum(a: number, b: number): number {
  return Math.ceil(a + (b - a) * Math.random());
}

function makeNonce(): number {
  return rndNum(-2147483648, 2147483647);
}

function makeRandomIv(): string {
  const str = "0123456789abcdefghijklmnopqrstuvwxyz";
  const result: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = Math.floor(Math.random() * str.length);
    result.push(str.charAt(r));
  }
  return result.join("");
}

function getAlgorithm(keyBase64: string): string {
  const key = Buffer.from(keyBase64);
  switch (key.length) {
    case 16:
      return "aes-128-cbc";
    case 24:
      return "aes-192-cbc";
    case 32:
      return "aes-256-cbc";
    default:
      throw new Error(`Invalid ZEGO_SERVER_SECRET key length: ${key.length} (expected 16, 24, or 32 bytes)`);
  }
}

function aesEncrypt(plainText: string, key: string, iv: string): ArrayBuffer {
  const cipher = createCipheriv(getAlgorithm(key), key, iv);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText);
  const final = cipher.final();
  const out = Buffer.concat([encrypted, final]);
  return Uint8Array.from(out).buffer;
}

/**
 * @param secret App Server Secret string used as AES key (must be 16, 24, or 32 bytes as UTF-8).
 */
export function generateToken04(
  appId: number,
  userId: string,
  secret: string,
  effectiveTimeInSeconds: number,
  payload = ""
): string {
  if (!appId || typeof appId !== "number") {
    throw new Error("Zego token: appID invalid");
  }
  if (!userId || typeof userId !== "string") {
    throw new Error("Zego token: userId invalid");
  }
  if (!secret || typeof secret !== "string") {
    throw new Error("Zego token: server secret invalid");
  }
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== "number") {
    throw new Error("Zego token: effectiveTimeInSeconds invalid");
  }

  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: makeNonce(),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || "",
  };

  const plaintText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();
  const encryptBuf = aesEncrypt(plaintText, secret, iv);

  const b1 = new Uint8Array(8);
  const b2 = new Uint8Array(2);
  const b3 = new Uint8Array(2);
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, iv.length, false);
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false);

  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(iv),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
  ]);
  const dv = new DataView(Uint8Array.from(buf).buffer);
  return `04${Buffer.from(dv.buffer).toString("base64")}`;
}
