/** A chunk of a Markdown file with source line attribution. */
export interface Chunk {
  content: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * Split a Markdown document into overlapping chunks suitable for indexing.
 *
 * Algorithm:
 *  1. Split on paragraph boundaries (double newline).
 *  2. Greedily merge consecutive paragraphs until the target size is reached.
 *  3. Overlap: the last `overlapChars` characters of the previous chunk are
 *     prepended to the next chunk (by including trailing paragraphs).
 *
 * @param content    Raw Markdown text
 * @param targetChars  Target chunk size in characters (default ~1600 ≈ 400 tokens)
 * @param overlapChars Overlap between consecutive chunks (default ~320 ≈ 80 tokens)
 */
export function chunkMarkdown(content: string, targetChars = 1600, overlapChars = 320): Chunk[] {
  if (!content.trim()) return [];

  const lines = content.split("\n");
  const paragraphs: { text: string; lineStart: number; lineEnd: number }[] = [];

  let paraLines: string[] = [];
  let paraStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" && paraLines.length > 0) {
      paragraphs.push({
        text: paraLines.join("\n"),
        lineStart: paraStart,
        lineEnd: paraStart + paraLines.length - 1,
      });
      paraLines = [];
      paraStart = i + 2;
    } else if (line.trim() !== "") {
      if (paraLines.length === 0) {
        paraStart = i + 1;
      }
      paraLines.push(line);
    } else if (paraLines.length === 0) {
      paraStart = i + 2;
    }
  }
  if (paraLines.length > 0) {
    paragraphs.push({
      text: paraLines.join("\n"),
      lineStart: paraStart,
      lineEnd: paraStart + paraLines.length - 1,
    });
  }

  if (paragraphs.length === 0) return [];

  if (content.length <= targetChars) {
    return [{ content: content.trim(), lineStart: 1, lineEnd: lines.length }];
  }

  const chunks: Chunk[] = [];
  let chunkParas: typeof paragraphs = [];
  let chunkLen = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const addLen = para.text.length + (chunkParas.length > 0 ? 2 : 0);

    if (chunkLen + addLen > targetChars && chunkParas.length > 0) {
      chunks.push({
        content: chunkParas.map((p) => p.text).join("\n\n"),
        lineStart: chunkParas[0].lineStart,
        lineEnd: chunkParas[chunkParas.length - 1].lineEnd,
      });

      let overlapLen = 0;
      let overlapStart = chunkParas.length;
      for (let j = chunkParas.length - 1; j >= 0; j--) {
        overlapLen += chunkParas[j].text.length + (j < chunkParas.length - 1 ? 2 : 0);
        if (overlapLen >= overlapChars) {
          overlapStart = j;
          break;
        }
        overlapStart = j;
      }
      chunkParas = chunkParas.slice(overlapStart);
      chunkLen =
        chunkParas.reduce((sum, p) => sum + p.text.length, 0) +
        Math.max(0, chunkParas.length - 1) * 2;
    }

    chunkParas.push(para);
    chunkLen += addLen;
  }

  if (chunkParas.length > 0) {
    chunks.push({
      content: chunkParas.map((p) => p.text).join("\n\n"),
      lineStart: chunkParas[0].lineStart,
      lineEnd: chunkParas[chunkParas.length - 1].lineEnd,
    });
  }

  return chunks;
}
