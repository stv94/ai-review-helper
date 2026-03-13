import { useState, useEffect, useRef } from 'react';
import { GitLabNote } from '../types';
import { Translations } from '../translations';

interface Props {
  t: Translations;
  notes: GitLabNote[];
  currentUserId: number | null;
  onAddComment: (body: string) => void;
  onDeleteComment: (noteId: number) => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function CommentsPanel({ t, notes, currentUserId, onAddComment, onDeleteComment }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [newBody, setNewBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const prevNotesLen = useRef(notes.length);

  // Reset posting state when a new comment appears
  useEffect(() => {
    if (notes.length > prevNotesLen.current) {
      setPosting(false);
    }
    prevNotesLen.current = notes.length;
  }, [notes.length]);

  const humanNotes = notes.filter((n) => !n.system);

  function handleSubmit() {
    if (!newBody.trim() || posting) return;
    setPosting(true);
    onAddComment(newBody.trim());
    setNewBody('');
  }

  function handleDelete(noteId: number) {
    onDeleteComment(noteId);
    setConfirmDeleteId(null);
  }

  return (
    <div className="comments-panel">
      <div className="comments-header" onClick={() => setExpanded((v) => !v)}>
        <span className="comments-title">
          {t.commentsTitle}
          <span className="comments-count">{humanNotes.length}</span>
        </span>
        <span className="mr-overview-toggle">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="comments-body">
          {humanNotes.length === 0 ? (
            <div className="comments-empty">{t.noComments}</div>
          ) : (
            <div className="comments-list">
              {humanNotes.map((note) => {
                const isOwn = currentUserId !== null && note.author.id === currentUserId;
                return (
                  <div key={note.id} className={`comment-item${isOwn ? ' comment-own' : ''}`}>
                    <div className="comment-meta">
                      <span className="comment-author">{note.author.name}</span>
                      <span className="comment-date">{formatDate(note.created_at)}</span>
                      {isOwn && (
                        <span className="comment-actions">
                          {confirmDeleteId === note.id ? (
                            <>
                              <span className="comment-confirm-label">{t.confirmDelete}</span>
                              <button
                                className="btn-ghost btn-xs comment-confirm-yes"
                                onClick={() => handleDelete(note.id)}
                              >
                                ✓
                              </button>
                              <button
                                className="btn-ghost btn-xs"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                ✗
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn-ghost btn-xs"
                              onClick={() => setConfirmDeleteId(note.id)}
                              title={t.confirmDelete}
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="comment-body">{note.body}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="comment-add">
            <textarea
              className="comment-textarea"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder={t.commentPlaceholder}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
              }}
            />
            <button
              className="btn-primary btn-sm"
              disabled={!newBody.trim() || posting}
              onClick={handleSubmit}
            >
              {t.postComment}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
