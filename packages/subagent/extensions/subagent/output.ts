/** Truncate UTF-8 output without exceeding a byte limit or looping on invalid limits. */
export function truncateOutput(output: string, maxBytes: number): string {
  const limit = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0;
  const bytes = Buffer.from(output, "utf8");
  if (bytes.length <= limit) return output;

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const end = Math.min(limit, bytes.length);
  let truncated = "";
  for (let endIndex = end; endIndex >= Math.max(0, end - 3); endIndex--) {
    try {
      truncated = decoder.decode(bytes.subarray(0, endIndex));
      break;
    } catch {
      // Drop an incomplete UTF-8 suffix; a code point is at most four bytes.
    }
  }

  const truncatedBytes = Buffer.byteLength(truncated, "utf8");
  return `${truncated}\n\n[Output truncated: ${bytes.length - truncatedBytes} bytes omitted. Full output preserved in tool details.]`;
}
