import { ApiError, fetcher } from '../../../lib/http/fetcher';

jest.mock('../../../lib/auth/redirectToLogin', () => ({
  redirectToLogin: jest.fn(),
}));

const redirectMock = require('../../../lib/auth/redirectToLogin') as {
  redirectToLogin: jest.Mock;
};

const makeResponse = (overrides: Partial<Response> & { status: number; ok: boolean; body?: string }): Response => {
  const { body, ...rest } = overrides;
  return {
    headers: new Headers(),
    text: async () => body ?? '',
    json: async () => (body ? JSON.parse(body) : undefined),
    bodyUsed: false,
    redirected: false,
    type: 'basic',
    url: 'http://example.com',
    clone() {
      return makeResponse(overrides);
    },
    ...rest,
  } as Response;
};

describe('fetcher', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'http://api.test';
  });

  it('returns parsed JSON payload on success (browser)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse({ status: 200, ok: true, body: JSON.stringify({ hello: 'world' }) }),
    );

    const result = await fetcher<{ hello: string }>('/hello');
    expect(result).toEqual({ hello: 'world' });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost/api/diagnostics/hello', expect.objectContaining({ credentials: 'include' }));
  });

  it('rewrites Request inputs to call the diagnostics proxy', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse({ status: 204, ok: true }),
    );

    const request = new Request('https://api.test/diagnostics/foo', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    await fetcher(request);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledRequest, init] = (global.fetch as jest.Mock).mock.calls[0] as [Request, RequestInit];
    expect(calledRequest).toBeInstanceOf(Request);
    expect(calledRequest.url).toBe('http://localhost/api/diagnostics/diagnostics/foo');
    expect(calledRequest.headers.get('Content-Type')).toBe('application/json');
    await expect(calledRequest.clone().json()).resolves.toEqual({ hello: 'world' });
    expect(init).toMatchObject({ credentials: 'include' });
  });

  it('throws ApiError with resolved metadata', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse({ status: 409, ok: false, body: JSON.stringify({ error: { code: 'E00103' } }) }),
    );

    await expect(fetcher('/oops')).rejects.toMatchObject<ApiError>({
      status: 409,
      code: 'E00103',
    });
  });

  it('invokes redirect on unauthorized responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse({ status: 401, ok: false, body: JSON.stringify({ error: { code: 'E00100' } }) }),
    );

    await expect(fetcher('/secure')).rejects.toMatchObject({ status: 401 });
    expect(redirectMock.redirectToLogin).toHaveBeenCalled();
  });
});
