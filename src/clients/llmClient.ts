import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { ReviewNarrative, DiffBlock, MergeRequest } from '../types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  private async chatCompletion(messages: ChatMessage[]): Promise<string> {
    const url = new URL(`${this.baseUrl}/chat/completions`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'ai-review-helper/0.1.0',
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data) as LLMResponse;
              const content = parsed.choices?.[0]?.message?.content;
              if (!content) {
                reject(new Error('LLM returned empty response'));
              } else {
                resolve(content);
              }
            } catch {
              reject(new Error(`Failed to parse LLM response: ${data.substring(0, 300)}`));
            }
          } else if (res.statusCode === 401) {
            reject(new Error('LLM authentication failed. Check your API key.'));
          } else if (res.statusCode === 429) {
            reject(new Error('LLM rate limit exceeded. Try again later.'));
          } else {
            reject(new Error(`LLM API error: ${res.statusCode} — ${data.substring(0, 300)}`));
          }
        });
      });

      req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('LLM request timed out (120s)'));
      });

      req.write(body);
      req.end();
    });
  }

  async generateNarrative(
    mr: MergeRequest,
    diffBlocks: DiffBlock[],
    maxChunkSize: number
  ): Promise<ReviewNarrative> {
    const chunks = chunkDiffBlocks(diffBlocks, maxChunkSize);

    if (chunks.length === 1) {
      return this.generateNarrativeForChunk(mr, chunks[0], diffBlocks);
    }

    // Multiple chunks — process each and merge
    const allBlocks: ReviewNarrative['blocks'] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const narrative = await this.generateNarrativeForChunk(mr, chunk, diffBlocks, i + 1, chunks.length);
      allBlocks.push(...narrative.blocks);
    }

    return { blocks: allBlocks };
  }

  private async generateNarrativeForChunk(
    mr: MergeRequest,
    diffBlocks: DiffBlock[],
    allDiffBlocks: DiffBlock[],
    chunkIndex?: number,
    totalChunks?: number
  ): Promise<ReviewNarrative> {
    const chunkInfo =
      chunkIndex !== undefined
        ? `\n\nNote: This is chunk ${chunkIndex} of ${totalChunks}. Cover only the diff blocks provided in this request.`
        : '';

    const diffBlocksText = diffBlocks
      .map(
        (b) =>
          `--- Diff Block ID: ${b.id} ---\nFile: ${b.filePath}${b.isNewFile ? ' (NEW FILE)' : b.isDeletedFile ? ' (DELETED)' : b.isRenamedFile ? ` (RENAMED from ${b.oldPath})` : ''}\n\n${b.patch}`
      )
      .join('\n\n');

    const allIds = diffBlocks.map((b) => b.id);

    const systemPrompt = `You are an expert code reviewer. Your job is to analyze a GitLab Merge Request and produce a structured, step-by-step walkthrough for the reviewer.

You must:
1. Group related diff blocks together into logical steps
2. Explain clearly what changed and why (based on available context)
3. Identify potential issues: bugs, code smells, architectural problems, incomplete changes
4. Use hedging language when making assumptions: "This likely...", "This might...", "It appears..."

Return ONLY valid JSON in this exact format:
{
  "blocks": [
    {
      "title": "Short descriptive title of this change group",
      "explanation": "Clear explanation of what changed and why. Be specific.",
      "diff_ids": ["diff-id-1", "diff-id-2"],
      "analysis": "Critical analysis: potential bugs, issues, things to watch out for. Be constructive."
    }
  ]
}

CRITICAL RULE: Every diff block ID must appear in exactly one "diff_ids" array. Missing IDs: ${allIds.join(', ')}${chunkInfo}`;

    const userMessage = `Merge Request: "${mr.title}"

Description:
${mr.description || '(no description provided)'}

Source branch: ${mr.source_branch} → Target: ${mr.target_branch}

Diff Blocks:
${diffBlocksText}`;

    const rawResponse = await this.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);

    return parseNarrativeResponse(rawResponse, allDiffBlocks);
  }

  async testConnection(): Promise<{ success: boolean; model?: string; error?: string }> {
    try {
      const response = await this.chatCompletion([
        { role: 'user', content: 'Say {"status":"ok"}' },
      ]);
      return { success: true, model: this.model };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

function chunkDiffBlocks(diffBlocks: DiffBlock[], maxChunkSize: number): DiffBlock[][] {
  const chunks: DiffBlock[][] = [];
  let current: DiffBlock[] = [];
  let currentSize = 0;

  for (const block of diffBlocks) {
    const blockSize = block.patch.length;
    if (current.length > 0 && currentSize + blockSize > maxChunkSize) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(block);
    currentSize += blockSize;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [[]];
}

function parseNarrativeResponse(raw: string, allDiffBlocks: DiffBlock[]): ReviewNarrative {
  let parsed: { blocks?: Array<{ title: string; explanation: string; diff_ids: string[]; analysis: string }> };

  try {
    // Extract JSON if wrapped in markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : raw;
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON. Raw: ${raw.substring(0, 500)}`);
  }

  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    throw new Error('LLM response missing "blocks" array');
  }

  return {
    blocks: parsed.blocks.map((b) => ({
      title: b.title || 'Untitled',
      explanation: b.explanation || '',
      diffIds: b.diff_ids || [],
      analysis: b.analysis || '',
    })),
  };
}
