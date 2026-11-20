import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { forInvoiceNinja } from "./files.ts";

describe("forInvoiceNinja", () => {
  it("leaves pictures and PDFs as they are", () => {
    for (const type of ["image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff", "application/pdf"]) {
      const f = { name: `a.${type.split("/")[1]}`, type, bytes: new Uint8Array([1, 2]) };
      expect(forInvoiceNinja(f)).toBe(f);
    }
  });

  it("zips a model file under its own name", () => {
    const bytes = new TextEncoder().encode("solid teil\nendsolid teil\n");
    const out = forInvoiceNinja({ name: "teil.stl", type: "model/stl", bytes });
    expect(out.name).toBe("teil.stl.zip");
    expect(out.type).toBe("application/zip");
    expect(unzipSync(out.bytes)).toEqual({ "teil.stl": bytes });
  });
});
