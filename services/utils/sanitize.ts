export const sanitize = (str: string) =>
  str
    .replace(/[^a-zA-Z0-9\-_\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
