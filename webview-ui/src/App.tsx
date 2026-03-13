import { useReducer, useEffect, useCallback } from 'react';
import {
  MergeRequest, DiffBlock, ParsedDiff, ReviewNarrative, ExtMessage,
  ApprovalState, GitLabNote, GitLabDiscussion, GitLabDiscussionPosition, DiffRefs,
} from './types';
import { TR, LangKey, Translations } from './translations';
import { postMessage } from './vscode';
import Toolbar from './components/Toolbar';
import InputScreen from './screens/InputScreen';
import LoadingScreen from './screens/LoadingScreen';
import ErrorScreen from './screens/ErrorScreen';
import MrScreen from './screens/MrScreen';
import ReviewScreen from './screens/ReviewScreen';

// ---- State ----
type Screen = 'input' | 'loading' | 'error' | 'mr' | 'review';

interface AppState {
  screen: Screen;
  mr: MergeRequest | null;
  diffBlocks: DiffBlock[];
  parsedDiffs: ParsedDiff[];
  narrative: ReviewNarrative | null;
  currentBlockIdx: number;
  diffModes: Record<string, 'inline' | 'split'>;
  loadingMsg: string;
  errorMsg: string;
  approvalState: ApprovalState | null;
  notes: GitLabNote[];
  currentUserId: number | null;
  discussions: GitLabDiscussion[];
  diffRefs: DiffRefs | null;
}

type AppAction =
  | { type: 'LOADING'; msg: string }
  | { type: 'ERROR'; msg: string }
  | { type: 'MR_LOADED'; mr: MergeRequest; diffBlocks: DiffBlock[]; approvalState: ApprovalState | null; notes: GitLabNote[]; currentUserId: number | null; discussions: GitLabDiscussion[] }
  | { type: 'REVIEW_READY'; narrative: ReviewNarrative; parsedDiffs: ParsedDiff[] }
  | { type: 'NAVIGATE'; delta: number }
  | { type: 'JUMP_TO'; idx: number }
  | { type: 'SET_DIFF_MODE'; diffId: string; mode: 'inline' | 'split' }
  | { type: 'BACK' }
  | { type: 'APPROVAL_UPDATED'; approvalState: ApprovalState }
  | { type: 'COMMENT_ADDED'; note: GitLabNote }
  | { type: 'COMMENT_DELETED'; noteId: number }
  | { type: 'INLINE_COMMENT_ADDED'; discussion: GitLabDiscussion }
  | { type: 'INLINE_COMMENT_DELETED'; discussionId: string; noteId: number };

const initial: AppState = {
  screen: 'input',
  mr: null,
  diffBlocks: [],
  parsedDiffs: [],
  narrative: null,
  currentBlockIdx: 0,
  diffModes: {},
  loadingMsg: '',
  errorMsg: '',
  approvalState: null,
  notes: [],
  currentUserId: null,
  discussions: [],
  diffRefs: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, screen: 'loading', loadingMsg: action.msg };
    case 'ERROR':
      return { ...state, screen: 'error', errorMsg: action.msg };
    case 'MR_LOADED':
      return {
        ...state,
        screen: 'mr',
        mr: action.mr,
        diffBlocks: action.diffBlocks,
        parsedDiffs: [],
        narrative: null,
        approvalState: action.approvalState,
        notes: action.notes,
        currentUserId: action.currentUserId,
        discussions: action.discussions,
        diffRefs: action.mr.diff_refs ?? null,
      };
    case 'REVIEW_READY':
      return {
        ...state,
        screen: 'review',
        narrative: action.narrative,
        parsedDiffs: action.parsedDiffs,
        currentBlockIdx: 0,
        diffModes: {},
      };
    case 'NAVIGATE': {
      if (!state.narrative) return state;
      const len = state.narrative.blocks.length;
      const idx = Math.max(0, Math.min(len - 1, state.currentBlockIdx + action.delta));
      return { ...state, currentBlockIdx: idx };
    }
    case 'JUMP_TO':
      return { ...state, currentBlockIdx: action.idx };
    case 'SET_DIFF_MODE':
      return {
        ...state,
        diffModes: { ...state.diffModes, [action.diffId]: action.mode },
      };
    case 'BACK':
      return { ...state, screen: 'input' };
    case 'APPROVAL_UPDATED':
      return { ...state, approvalState: action.approvalState };
    case 'COMMENT_ADDED':
      return { ...state, notes: [...state.notes, action.note] };
    case 'COMMENT_DELETED':
      return { ...state, notes: state.notes.filter((n) => n.id !== action.noteId) };
    case 'INLINE_COMMENT_ADDED':
      return { ...state, discussions: [...state.discussions, action.discussion] };
    case 'INLINE_COMMENT_DELETED': {
      const updated = state.discussions
        .map((d) =>
          d.id === action.discussionId
            ? { ...d, notes: d.notes.filter((n) => n.id !== action.noteId) }
            : d
        )
        .filter((d) => d.notes.some((n) => !n.system));
      return { ...state, discussions: updated };
    }
    default:
      return state;
  }
}

// ---- Resolve language ----
function resolveLang(): Translations {
  const lang = (document.getElementById('root')?.dataset.lang ?? 'en') as LangKey;
  return TR[lang] ?? TR['en'];
}

const t = resolveLang();

// ---- App component ----
export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);

  // Listen for messages from the extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtMessage;
      switch (msg.type) {
        case 'loading':
          dispatch({ type: 'LOADING', msg: msg.message });
          break;
        case 'error':
          dispatch({ type: 'ERROR', msg: msg.message });
          break;
        case 'mrLoaded':
          dispatch({
            type: 'MR_LOADED',
            mr: msg.mr,
            diffBlocks: msg.diffBlocks,
            approvalState: msg.approvalState,
            notes: msg.notes,
            currentUserId: msg.currentUserId,
            discussions: msg.discussions,
          });
          break;
        case 'reviewReady':
          dispatch({ type: 'REVIEW_READY', narrative: msg.narrative, parsedDiffs: msg.parsedDiffs });
          break;
        case 'approvalUpdated':
          dispatch({ type: 'APPROVAL_UPDATED', approvalState: msg.approvalState });
          break;
        case 'commentAdded':
          dispatch({ type: 'COMMENT_ADDED', note: msg.note });
          break;
        case 'commentDeleted':
          dispatch({ type: 'COMMENT_DELETED', noteId: msg.noteId });
          break;
        case 'inlineCommentAdded':
          dispatch({ type: 'INLINE_COMMENT_ADDED', discussion: msg.discussion });
          break;
        case 'inlineCommentDeleted':
          dispatch({ type: 'INLINE_COMMENT_DELETED', discussionId: msg.discussionId, noteId: msg.noteId });
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const setDiffMode = useCallback((diffId: string, mode: 'inline' | 'split') => {
    dispatch({ type: 'SET_DIFF_MODE', diffId, mode });
  }, []);

  const openInGitLab = useCallback((url: string) => {
    postMessage({ type: 'openInGitLab', url });
  }, []);

  const onApprove = useCallback(() => postMessage({ type: 'approveMR' }), []);
  const onRevoke = useCallback(() => postMessage({ type: 'revokeMR' }), []);
  const onAddComment = useCallback((body: string) => postMessage({ type: 'addComment', body }), []);
  const onDeleteComment = useCallback((noteId: number) => postMessage({ type: 'deleteComment', noteId }), []);

  const onAddInlineComment = useCallback(
    (body: string, position: GitLabDiscussionPosition) =>
      postMessage({ type: 'addInlineComment', body, position }),
    []
  );
  const onDeleteInlineComment = useCallback(
    (discussionId: string, noteId: number) =>
      postMessage({ type: 'deleteInlineComment', discussionId, noteId }),
    []
  );

  const showBack = state.screen !== 'input';

  return (
    <div className="app">
      <Toolbar
        t={t}
        showBack={showBack}
        onBack={() => dispatch({ type: 'BACK' })}
        onSettings={() => postMessage({ type: 'openSettings' })}
      />

      <div className="content">
        {state.screen === 'input' && <InputScreen t={t} />}

        {state.screen === 'loading' && (
          <LoadingScreen msg={state.loadingMsg || t.loadingDefault} />
        )}

        {state.screen === 'error' && (
          <ErrorScreen msg={state.errorMsg} onBack={() => dispatch({ type: 'BACK' })} />
        )}

        {state.screen === 'mr' && state.mr && (
          <MrScreen
            t={t}
            mr={state.mr}
            diffBlocks={state.diffBlocks}
            approvalState={state.approvalState}
            notes={state.notes}
            currentUserId={state.currentUserId}
            onOpenInGitLab={openInGitLab}
            onApprove={onApprove}
            onRevoke={onRevoke}
            onAddComment={onAddComment}
            onDeleteComment={onDeleteComment}
          />
        )}

        {state.screen === 'review' && state.mr && state.narrative && (
          <ReviewScreen
            t={t}
            mr={state.mr}
            narrative={state.narrative}
            parsedDiffs={state.parsedDiffs}
            currentBlockIdx={state.currentBlockIdx}
            diffModes={state.diffModes}
            approvalState={state.approvalState}
            currentUserId={state.currentUserId}
            discussions={state.discussions}
            diffRefs={state.diffRefs}
            onPrev={() => dispatch({ type: 'NAVIGATE', delta: -1 })}
            onNext={() => dispatch({ type: 'NAVIGATE', delta: 1 })}
            onJump={(idx) => dispatch({ type: 'JUMP_TO', idx })}
            onSetDiffMode={setDiffMode}
            onOpenInGitLab={openInGitLab}
            onApprove={onApprove}
            onRevoke={onRevoke}
            onAddInlineComment={onAddInlineComment}
            onDeleteInlineComment={onDeleteInlineComment}
          />
        )}
      </div>
    </div>
  );
}
