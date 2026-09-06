/**
 * Kit token suffix matches ZegoUIKitPrebuilt.generateKitTokenForProduction (see prebuilt bundle):
 * token + "#" + base64(JSON.stringify({ userID, roomID, userName: encodeURIComponent(userName), appID }))
 */

export function generateZegoKitToken(options: {
  appID: number;
  token: string;
  roomID: string;
  userID: string;
  userName: string;
}): string {
  const { appID, token, roomID, userID, userName } = options;
  const json = JSON.stringify({
    userID,
    roomID,
    userName: encodeURIComponent(userName || ""),
    appID,
  });
  return `${token}#${Buffer.from(json, "utf8").toString("base64")}`;
}
