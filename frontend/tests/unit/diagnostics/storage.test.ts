import { clearSessionSnapshot, listStoredDiagnosticCodes, persistSessionSnapshot, readSessionSnapshot } from '../../../features/diagnostics/session/storage';
import { DiagnosticSessionState } from '../../../features/diagnostics/session/types';

const sampleState: DiagnosticSessionState = {
  diagnostic_code: 'ai_career',
  version_id: 1,
  session_code: 'S1',
  status: 'in_progress',
  choices: { Q01: [1, 2] },
  llm_result: null,
  llm_messages: null,
  completed_at: null,
  expires_at: null,
  version_options_hash: null,
  is_linked: false,
};

describe('diagnostic session storage helpers', () => {
  afterEach(() => {
    clearSessionSnapshot('ai_career');
    window.localStorage.clear();
  });

  it('persists to localStorage when permitted', () => {
    persistSessionSnapshot(sampleState, { useLocalStorage: true });
    const restored = readSessionSnapshot('ai_career');
    expect(restored).toEqual(sampleState);
  });

  it('falls back to in-memory store on localStorage failure', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    persistSessionSnapshot(sampleState, { useLocalStorage: true });
    expect(readSessionSnapshot('ai_career')).toEqual(sampleState);
    setItem.mockRestore();
  });

  it('normalises missing is_linked flag to false', () => {
    const key = 'diagnostic_session:ai_career';
    window.localStorage.setItem(key, JSON.stringify({ ...sampleState, is_linked: undefined }));

    const restored = readSessionSnapshot('ai_career');
    expect(restored?.is_linked).toBe(false);
  });

  it('lists stored diagnostic codes across fallback and local storage', () => {
    persistSessionSnapshot(sampleState, { useLocalStorage: false });
    window.localStorage.setItem(
      'diagnostic_session:marketing',
      JSON.stringify({
        ...sampleState,
        diagnostic_code: 'marketing',
        session_code: 'S2',
        is_linked: false,
      }),
    );

    const codes = listStoredDiagnosticCodes().sort();
    expect(codes).toEqual(['ai_career', 'marketing']);
  });
});
