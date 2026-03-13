import { DiffBlock, ReviewNarrative, NarrativeBlock } from '../types';
import { findUnreferencedDiffs } from '../parsers/diffParser';

/**
 * Post-process the LLM narrative to ensure all diff blocks are covered.
 * Any unreferenced diffs are added as an "Unreferenced changes" block.
 */
export function ensureDiffCoverage(
  narrative: ReviewNarrative,
  allDiffBlocks: DiffBlock[]
): ReviewNarrative {
  const assignedIds = new Set<string>();

  for (const block of narrative.blocks) {
    for (const id of block.diffIds) {
      assignedIds.add(id);
    }
  }

  const unrefDiffs = findUnreferencedDiffs(allDiffBlocks, assignedIds);

  if (unrefDiffs.length === 0) {
    return narrative;
  }

  const unreferencedBlock: NarrativeBlock = {
    title: 'Unreferenced Changes',
    explanation:
      'The following diff blocks were not included in the AI analysis. They may contain relevant changes.',
    diffIds: unrefDiffs.map((d) => d.id),
    diffContexts: [],
    analysis:
      'These changes were not analyzed by the LLM. Review them manually to ensure nothing was missed.',
  };

  return {
    overview: narrative.overview,
    blocks: [...narrative.blocks, unreferencedBlock],
  };
}

/**
 * Validate that all diff IDs referenced in the narrative actually exist.
 * Returns a cleaned narrative with invalid IDs removed.
 */
export function validateNarrativeDiffIds(
  narrative: ReviewNarrative,
  allDiffBlocks: DiffBlock[]
): ReviewNarrative {
  const validIds = new Set(allDiffBlocks.map((b) => b.id));

  return {
    overview: narrative.overview,
    blocks: narrative.blocks.map((block) => ({
      ...block,
      diffIds: block.diffIds.filter((id) => {
        const valid = validIds.has(id);
        if (!valid) {
          console.warn(`[ai-review-helper] Narrative references unknown diff ID: ${id}`);
        }
        return valid;
      }),
    })),
  };
}
