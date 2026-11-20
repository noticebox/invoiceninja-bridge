// What a file becomes in Invoice Ninja. Invoice Ninja checks a document by its content against a fixed list of types (Laravel's
// `mimes`: pictures, PDF, office files, zip …); a 3D model (STL, 3MF, OBJ, STEP) reads as an unknown binary and is refused, whatever
// extension is added to the list (ADR 0003). So pictures and PDFs go as they are, everything else as a zip holding it under its name.
import { zipSync } from "fflate";

export type FileBytes = { name: string; type: string; bytes: Uint8Array };

/** The largest document Invoice Ninja takes (its `max:100000`, in KB). */
export const MAX_BYTES = 100_000 * 1024;

const AS_THEY_ARE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/tiff", "application/pdf"]);

export function forInvoiceNinja(f: FileBytes): FileBytes {
  if (AS_THEY_ARE.has(f.type.toLowerCase())) return f;
  return { name: `${f.name}.zip`, type: "application/zip", bytes: zipSync({ [f.name]: [f.bytes, { level: 6 }] }) };
}
