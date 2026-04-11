import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

export async function compressPdf(input: Buffer): Promise<Buffer> {
  const tmpIn = join(tmpdir(), `gs-in-${randomUUID()}.pdf`);
  const tmpOut = join(tmpdir(), `gs-out-${randomUUID()}.pdf`);
  try {
    writeFileSync(tmpIn, input);
    await execFileAsync("gs", [
      "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
      "-dSimulateOverprint=true",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/ebook",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dAutoRotatePages=/None",
      "-dColorImageDownsampleType=/Bicubic",
      "-dColorImageResolution=100",
      "-dGrayImageDownsampleType=/Bicubic",
      "-dGrayImageResolution=100",
      "-dMonoImageDownsampleType=/Bicubic",
      "-dMonoImageResolution=100",
      `-sOutputFile=${tmpOut}`,
      "-sOwnerPassword=",
      "-sUserPassword=",
      tmpIn,
    ]);
    const compressed = readFileSync(tmpOut);
    const savedPct = (((input.length - compressed.length) / input.length) * 100).toFixed(1);
    if (compressed.length < input.length) {
      console.log(`[pdf] compressed ${input.length} → ${compressed.length} bytes (saved ${savedPct}%)`);
      return compressed;
    } else {
      console.log(`[pdf] compression had no effect (${input.length} bytes), using original`);
      return input;
    }
  } finally {
    try { unlinkSync(tmpIn); } catch { /* already gone */ }
    try { unlinkSync(tmpOut); } catch { /* not written */ }
  }
}
