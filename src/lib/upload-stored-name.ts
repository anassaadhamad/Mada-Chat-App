/** Matches names produced by `/api/upload` (`randomUUID` + optional safe extension). */
export const STORED_UPLOAD_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,10})?$/i;

export function isStoredUploadFileName(name: string): boolean {
  return STORED_UPLOAD_NAME_RE.test(name) && !name.includes("..") && !name.includes("/");
}
