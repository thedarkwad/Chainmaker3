import { compress } from "compress-pdf";

export async function compressPdf(input: Buffer): Promise<Buffer> {
  const compressed = await compress(input, { resolution: "ebook" });

  const savedBytes = input.length - compressed.length;
  const savedPct = ((savedBytes / input.length) * 100).toFixed(1);
  if (compressed.length < input.length) {
    console.log(`[pdf] compressed ${input.length} → ${compressed.length} bytes (saved ${savedPct}%)`);
    return compressed;
  } else {
    console.log(`[pdf] compression had no effect (${input.length} bytes), using original`);
    return input;
  }
}
