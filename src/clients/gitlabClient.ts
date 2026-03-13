import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { MergeRequest, GitLabChange, GitLabCommit, GitLabUser, GitLabNote, ApprovalState } from '../types';

export class GitLabClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  private async request<T>(path: string): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v4${path}`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'PRIVATE-TOKEN': this.token,
          'Content-Type': 'application/json',
          'User-Agent': 'ai-review-helper/0.1.0',
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
            }
          } else if (res.statusCode === 401) {
            reject(new Error('Authentication failed. Check your GitLab token.'));
          } else if (res.statusCode === 403) {
            reject(new Error('Access denied. Your token may not have the required permissions.'));
          } else if (res.statusCode === 404) {
            reject(new Error(`Not found. Check the project path and MR ID. (${res.statusCode})`));
          } else {
            reject(new Error(`GitLab API error: ${res.statusCode} — ${data.substring(0, 300)}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Network error: ${err.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out (30s)'));
      });

      req.end();
    });
  }

  private async requestPost<T>(path: string, body?: object): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v4${path}`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = body ? JSON.stringify(body) : '';

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': this.token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'User-Agent': 'ai-review-helper/0.1.0',
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            if (!data.trim()) {
              resolve(null as unknown as T);
            } else {
              try {
                resolve(JSON.parse(data) as T);
              } catch {
                reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
              }
            }
          } else if (res.statusCode === 401) {
            reject(new Error('Authentication failed. Check your GitLab token.'));
          } else if (res.statusCode === 403) {
            reject(new Error('Access denied. Your token may not have the required permissions.'));
          } else if (res.statusCode === 404) {
            reject(new Error(`Not found. (${res.statusCode})`));
          } else {
            reject(new Error(`GitLab API error: ${res.statusCode} — ${data.substring(0, 300)}`));
          }
        });
      });

      req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timed out (30s)')); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  private async requestDelete(path: string): Promise<void> {
    const url = new URL(`${this.baseUrl}/api/v4${path}`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'DELETE',
        headers: {
          'PRIVATE-TOKEN': this.token,
          'Content-Type': 'application/json',
          'User-Agent': 'ai-review-helper/0.1.0',
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && (res.statusCode === 204 || (res.statusCode >= 200 && res.statusCode < 300))) {
            resolve();
          } else if (res.statusCode === 401) {
            reject(new Error('Authentication failed. Check your GitLab token.'));
          } else if (res.statusCode === 403) {
            reject(new Error('Access denied. Cannot delete this comment.'));
          } else if (res.statusCode === 404) {
            reject(new Error('Comment not found.'));
          } else {
            reject(new Error(`GitLab API error: ${res.statusCode} — ${data.substring(0, 300)}`));
          }
        });
      });

      req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timed out (30s)')); });
      req.end();
    });
  }

  async getMergeRequest(projectPath: string, mrIid: number): Promise<MergeRequest> {
    const encodedPath = encodeURIComponent(projectPath);
    const mr = await this.request<MergeRequest>(
      `/projects/${encodedPath}/merge_requests/${mrIid}`
    );
    mr.projectPath = projectPath;
    return mr;
  }

  async getMergeRequestChanges(projectPath: string, mrIid: number): Promise<GitLabChange[]> {
    const encodedPath = encodeURIComponent(projectPath);
    const data = await this.request<{ changes: GitLabChange[] }>(
      `/projects/${encodedPath}/merge_requests/${mrIid}/changes`
    );
    return data.changes || [];
  }

  async getMergeRequestCommits(projectPath: string, mrIid: number): Promise<GitLabCommit[]> {
    const encodedPath = encodeURIComponent(projectPath);
    return this.request<GitLabCommit[]>(
      `/projects/${encodedPath}/merge_requests/${mrIid}/commits`
    );
  }

  async getCurrentUser(): Promise<GitLabUser> {
    return this.request<GitLabUser>('/user');
  }

  async getMrApprovalState(projectPath: string, mrIid: number): Promise<ApprovalState> {
    const encodedPath = encodeURIComponent(projectPath);
    const data = await this.request<{
      approved: boolean;
      approved_by: Array<{ user: GitLabUser }>;
    }>(`/projects/${encodedPath}/merge_requests/${mrIid}/approvals`);
    return {
      approved: data.approved,
      approvedBy: (data.approved_by || []).map((a) => a.user),
    };
  }

  async approveMR(projectPath: string, mrIid: number): Promise<void> {
    const encodedPath = encodeURIComponent(projectPath);
    await this.requestPost<unknown>(`/projects/${encodedPath}/merge_requests/${mrIid}/approve`);
  }

  async revokeMR(projectPath: string, mrIid: number): Promise<void> {
    const encodedPath = encodeURIComponent(projectPath);
    await this.requestPost<unknown>(`/projects/${encodedPath}/merge_requests/${mrIid}/unapprove`);
  }

  async getMrNotes(projectPath: string, mrIid: number): Promise<GitLabNote[]> {
    const encodedPath = encodeURIComponent(projectPath);
    return this.request<GitLabNote[]>(
      `/projects/${encodedPath}/merge_requests/${mrIid}/notes?sort=asc&order_by=created_at&per_page=100`
    );
  }

  async addMrNote(projectPath: string, mrIid: number, body: string): Promise<GitLabNote> {
    const encodedPath = encodeURIComponent(projectPath);
    return this.requestPost<GitLabNote>(
      `/projects/${encodedPath}/merge_requests/${mrIid}/notes`,
      { body }
    );
  }

  async deleteMrNote(projectPath: string, mrIid: number, noteId: number): Promise<void> {
    const encodedPath = encodeURIComponent(projectPath);
    await this.requestDelete(`/projects/${encodedPath}/merge_requests/${mrIid}/notes/${noteId}`);
  }

  async testConnection(): Promise<{ success: boolean; user?: string; error?: string }> {
    try {
      const user = await this.request<{ name: string; username: string }>('/user');
      return { success: true, user: `${user.name} (@${user.username})` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

/**
 * Parse a GitLab MR URL and extract project path and MR IID.
 *
 * Supports formats:
 *   https://gitlab.com/group/project/-/merge_requests/42
 *   https://gitlab.example.com/a/b/c/-/merge_requests/7
 */
export function parseMrUrl(
  mrUrl: string,
  expectedBase?: string
): { projectPath: string; mrIid: number; baseUrl: string } | null {
  try {
    const url = new URL(mrUrl);
    const match = url.pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)/);
    if (!match) return null;
    const projectPath = match[1];
    const mrIid = parseInt(match[2], 10);
    const baseUrl = `${url.protocol}//${url.host}`;

    if (expectedBase) {
      const expected = new URL(expectedBase);
      if (url.host !== expected.host) {
        // Different host — still parse, caller decides whether to warn
      }
    }

    return { projectPath, mrIid, baseUrl };
  } catch {
    return null;
  }
}
