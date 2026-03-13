import { GitLabChange, DiffBlock, DiffHunk, DiffLine, ParsedDiff } from '../types';

/**
 * Convert GitLab change objects into DiffBlocks with stable IDs.
 */
export function changesToDiffBlocks(changes: GitLabChange[]): DiffBlock[] {
  return changes
    .filter((c) => c.diff && c.diff.trim().length > 0)
    .map((c, index) => ({
      id: `diff-${index + 1}`,
      filePath: c.new_path || c.old_path,
      oldPath: c.old_path,
      newPath: c.new_path,
      patch: c.diff,
      isNewFile: c.new_file ?? false,
      isDeletedFile: c.deleted_file ?? false,
      isRenamedFile: c.renamed_file ?? false,
    }));
}

/**
 * Parse unified diff patch into hunks with typed lines.
 */
export function parseDiff(block: DiffBlock): ParsedDiff {
  const lines = block.patch.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkHeader = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);

    if (hunkHeader) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      oldLine = parseInt(hunkHeader[1], 10);
      newLine = parseInt(hunkHeader[3], 10);
      currentHunk = {
        header: line,
        oldStart: oldLine,
        oldCount: parseInt(hunkHeader[2] ?? '1', 10),
        newStart: newLine,
        newCount: parseInt(hunkHeader[4] ?? '1', 10),
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({
        type: 'added',
        content: line.substring(1),
        oldLineNumber: null,
        newLineNumber: newLine++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({
        type: 'removed',
        content: line.substring(1),
        oldLineNumber: oldLine++,
        newLineNumber: null,
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.startsWith(' ') ? line.substring(1) : '',
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    }
    // Skip \ No newline at end of file
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return { block, hunks };
}

export function parseAllDiffs(blocks: DiffBlock[]): ParsedDiff[] {
  return blocks.map(parseDiff);
}

/**
 * Ensure every diff block from GitLab is referenced in the narrative.
 * Returns diff blocks that were not assigned to any narrative block.
 */
export function findUnreferencedDiffs(
  diffBlocks: DiffBlock[],
  assignedIds: Set<string>
): DiffBlock[] {
  return diffBlocks.filter((b) => !assignedIds.has(b.id));
}
