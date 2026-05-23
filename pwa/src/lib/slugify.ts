// Simple slugify function for filesystem-safe filenames.
// Converts spaces to hyphens, strips special chars, lowercases.

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars except word, space, hyphen
    .replace(/[\s_]+/g, "-")   // Replace spaces/underscores with single hyphen
    .replace(/-+/g, "-")       // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, "");  // Remove leading/trailing hyphens
}