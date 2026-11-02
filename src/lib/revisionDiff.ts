export interface RevisionDiffRow {
  kind: "unchanged" | "added" | "removed";
  text: string;
  beforeLine?: number;
  afterLine?: number;
}

export interface RevisionDiff {
  rows: RevisionDiffRow[];
  /** Counts are available only when limited is false. */
  added: number;
  removed: number;
  limited: boolean;
  message?: string;
}

// Bound both rendering work and the quadratic LCS matrix. Long revisions remain
// available in Preview rather than being silently truncated by the comparison.
export const REVISION_DIFF_LIMITS = {
  characters: 200_000,
  lines: 1_000,
  cells: 1_000_000,
} as const;

function linesOf(text: string): string[] {
  if (!text) return [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  // A final newline terminates the last logical line; it is not an added line.
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function unavailable(): RevisionDiff {
  return {
    rows: [],
    added: 0,
    removed: 0,
    limited: true,
    message:
      "This revision is too large for an inline comparison. Use Preview to review each complete revision.",
  };
}

/**
 * Compare plain text or Markdown, never HTML markup. Render row.text as text.
 * The caller decides how to convert rich content and displays title changes
 * separately. Equal-line ties prefer removals, then additions, for stable output.
 */
export function diffRevisionText(before: string, after: string): RevisionDiff {
  if (
    before.length > REVISION_DIFF_LIMITS.characters ||
    after.length > REVISION_DIFF_LIMITS.characters
  )
    return unavailable();

  const left = linesOf(before);
  const right = linesOf(after);
  if (
    left.length > REVISION_DIFF_LIMITS.lines ||
    right.length > REVISION_DIFF_LIMITS.lines
  )
    return unavailable();

  let prefix = 0;
  while (
    prefix < left.length &&
    prefix < right.length &&
    left[prefix] === right[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - suffix - 1] === right[right.length - suffix - 1]
  )
    suffix++;

  const leftCount = left.length - prefix - suffix;
  const rightCount = right.length - prefix - suffix;
  const stride = rightCount + 1;
  const cellCount = (leftCount + 1) * stride;
  if (cellCount > REVISION_DIFF_LIMITS.cells) return unavailable();

  const matrix = new Uint16Array(cellCount);
  for (let i = leftCount - 1; i >= 0; i--) {
    for (let j = rightCount - 1; j >= 0; j--) {
      matrix[i * stride + j] =
        left[prefix + i] === right[prefix + j]
          ? matrix[(i + 1) * stride + j + 1] + 1
          : Math.max(matrix[(i + 1) * stride + j], matrix[i * stride + j + 1]);
    }
  }

  const result: RevisionDiff = {
    rows: [],
    added: 0,
    removed: 0,
    limited: false,
  };
  const unchanged = (beforeIndex: number, afterIndex: number) => {
    result.rows.push({
      kind: "unchanged",
      text: left[beforeIndex],
      beforeLine: beforeIndex + 1,
      afterLine: afterIndex + 1,
    });
  };
  for (let i = 0; i < prefix; i++) unchanged(i, i);

  let i = 0;
  let j = 0;
  while (i < leftCount || j < rightCount) {
    if (
      i < leftCount &&
      j < rightCount &&
      left[prefix + i] === right[prefix + j]
    ) {
      unchanged(prefix + i++, prefix + j++);
    } else if (
      i < leftCount &&
      (j === rightCount ||
        matrix[(i + 1) * stride + j] >= matrix[i * stride + j + 1])
    ) {
      result.rows.push({
        kind: "removed",
        text: left[prefix + i],
        beforeLine: prefix + ++i,
      });
      result.removed++;
    } else {
      result.rows.push({
        kind: "added",
        text: right[prefix + j],
        afterLine: prefix + ++j,
      });
      result.added++;
    }
  }
  for (let k = suffix; k > 0; k--) unchanged(left.length - k, right.length - k);
  return result;
}
