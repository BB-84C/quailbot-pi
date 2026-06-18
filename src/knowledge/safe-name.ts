export function isSafeKnowledgeName(name: string): boolean {
  return typeof name === "string" && name.length > 0 && name.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes("..");
}
