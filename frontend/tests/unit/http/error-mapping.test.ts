import { mapApiErrorToMessage } from '../../../lib/http/error-mapping';

describe('mapApiErrorToMessage', () => {
  it('leverages error code definitions when available', () => {
    const result = mapApiErrorToMessage(401, 'E00100');
    expect(result.code).toBe('E00100');
    expect(result.message).toContain('ログイン');
    expect(result.variant).toBe('warning');
  });

  it('returns info variant on 404 without code', () => {
    const result = mapApiErrorToMessage(404);
    expect(result.variant).toBe('info');
    expect(result.message).toBe('データが見つかりません');
    expect(result.code).toBe('E00103');
  });

  it('maps conflict status to conflict code', () => {
    const result = mapApiErrorToMessage(409);
    expect(result.code).toBe('E00104');
    expect(result.message).toBe('操作が競合しました。再度お試しください');
    expect(result.variant).toBe('warning');
  });

  it('defaults to error variant for server failures', () => {
    const result = mapApiErrorToMessage(503);
    expect(result.variant).toBe('error');
    expect(result.code).toBe('E00999');
    expect(result.message).toBe('予期しないエラーが発生しました');
  });
});
