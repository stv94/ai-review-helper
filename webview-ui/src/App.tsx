import { useReducer, useEffect, useCallback } from 'react';
import { MergeRequest, DiffBlock, ParsedDiff, ReviewNarrative, ExtMessage } from './types';
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
}

type AppAction =
  | { type: 'LOADING'; msg: string }
  | { type: 'ERROR'; msg: string }
  | { type: 'MR_LOADED'; mr: MergeRequest; diffBlocks: DiffBlock[] }
  | { type: 'REVIEW_READY'; narrative: ReviewNarrative; parsedDiffs: ParsedDiff[] }
  | { type: 'NAVIGATE'; delta: number }
  | { type: 'JUMP_TO'; idx: number }
  | { type: 'SET_DIFF_MODE'; diffId: string; mode: 'inline' | 'split' }
  | { type: 'BACK' };

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
          dispatch({ type: 'MR_LOADED', mr: msg.mr, diffBlocks: msg.diffBlocks });
          break;
        case 'reviewReady':
          dispatch({ type: 'REVIEW_READY', narrative: msg.narrative, parsedDiffs: msg.parsedDiffs });
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
            onOpenInGitLab={openInGitLab}
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
            onPrev={() => dispatch({ type: 'NAVIGATE', delta: -1 })}
            onNext={() => dispatch({ type: 'NAVIGATE', delta: 1 })}
            onJump={(idx) => dispatch({ type: 'JUMP_TO', idx })}
            onSetDiffMode={setDiffMode}
            onOpenInGitLab={openInGitLab}
          />
        )}
      </div>
    </div>
  );
}
