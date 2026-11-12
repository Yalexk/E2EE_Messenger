import { useCallback, useEffect, useRef, useState } from 'react';
import { initialState, advance, canAdvance, sendChat, STEPS, stepIndex } from './engine.js';

const AUTOPLAY_MS = 2600;

export function usePlayground() {
  const [state, setState] = useState(() => initialState());
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState('Hi Bob! This is our first end-to-end encrypted message.');
  const ref = useRef(state);
  ref.current = state;
  const busyRef = useRef(false);

  const run = useCallback(async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const next = await fn(ref.current);
      ref.current = next;
      setState(next);
    } catch (error) {
      console.error(error);
      setState((s) => ({ ...s, error: error.message }));
      setPlaying(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const next = useCallback(() => {
    if (!canAdvance(ref.current)) return;
    return run((s) => advance(s, { text: draft }));
  }, [run, draft]);

  const reset = useCallback(() => {
    setPlaying(false);
    const s = initialState(ref.current.options);
    ref.current = s;
    setState(s);
  }, []);

  const setOption = useCallback((key, value) => {
    setState((s) => {
      const n = { ...s, options: { ...s.options, [key]: value } };
      ref.current = n;
      return n;
    });
  }, []);

  /** After a failed verification: stop the attack and fetch the bundle again. */
  const retryHonestly = useCallback(() => run(async (s) => {
    let n = { ...s, options: { ...s.options, tamperSpk: false }, step: stepIndex('publish'), verify: null, delivered: null };
    n = await advance(n); // fetch (consumes another OPK, as a real retry would)
    n = await advance(n); // verify
    return n;
  }), [run]);

  const skipToChat = useCallback(() => {
    setPlaying(false);
    return run(async (s) => {
      let n = s;
      while (STEPS[n.step].id !== 'chat' && canAdvance(n)) n = await advance(n, { text: draft });
      return n;
    });
  }, [run, draft]);

  const chat = useCallback((from, text) => run((s) => sendChat(s, from, text)), [run]);

  // Autoplay: step forward on a timer until blocked or at the end.
  useEffect(() => {
    if (!playing) return undefined;
    if (!canAdvance(state) || STEPS[state.step].id === 'chat') {
      setPlaying(false);
      return undefined;
    }
    const t = setTimeout(() => next(), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, state, next]);

  return {
    state,
    step: STEPS[state.step],
    busy,
    playing,
    setPlaying,
    draft,
    setDraft,
    next,
    reset,
    setOption,
    retryHonestly,
    skipToChat,
    chat,
    canAdvance: canAdvance(state),
  };
}
