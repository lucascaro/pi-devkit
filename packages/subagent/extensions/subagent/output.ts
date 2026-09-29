/** Truncate UTF-8 output without exceeding a byte limit or looping on invalid limits. */
function utf8Prefix(bytes: Buffer, maxBytes: number): string {
  const end = Math.min(bytes.length, Math.max(0, Math.floor(maxBytes)));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let endIndex = end; endIndex >= Math.max(0, end - 3); endIndex--) {
    try {
      return decoder.decode(bytes.subarray(0, endIndex));
    } catch {
      // Drop an incomplete UTF-8 suffix; a code point is at most four bytes.
    }
  }
  return "";
}

export function truncateOutput(output: string, maxBytes: number): string {
  const limit = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0;
  const bytes = Buffer.from(output, "utf8");
  if (bytes.length <= limit) return output;

  const markerFor = (omittedBytes: number) =>
    `\n\n[Output truncated: ${omittedBytes} bytes omitted. Full output preserved in tool details.]`;
  const markerBudget = Buffer.byteLength(markerFor(bytes.length), "utf8");
  if (limit <= markerBudget) return utf8Prefix(bytes, limit);

  const truncated = utf8Prefix(bytes, limit - markerBudget);
  const omittedBytes = bytes.length - Buffer.byteLength(truncated, "utf8");
  return `${truncated}${markerFor(omittedBytes)}`;
}
