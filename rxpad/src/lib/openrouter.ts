import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
const OPENROUTER_TOKEN_ENDPOINTS = [
  'https://openrouter.ai/api/v1/auth/token',
  'https://openrouter.ai/api/v1/oauth/token',
] as const;
const OPENROUTER_MODEL = 'google/gemini-2.0-flash-001';

const PKCE_VERIFIER_KEY = 'openrouter_pkce_verifier';
const PKCE_STATE_KEY = 'openrouter_pkce_state';
const PKCE_RETURN_PATH_KEY = 'openrouter_pkce_return_path';

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

export function generateCodeVerifier(): string {
  return randomString(64);
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(hashBuffer));
}

export async function startOAuthFlow(options?: {
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  returnPath?: string;
}): Promise<void> {
  const clientId = options?.clientId ?? import.meta.env.VITE_OPENROUTER_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing OpenRouter client ID. Set VITE_OPENROUTER_CLIENT_ID.');
  }

  const redirectUri = options?.redirectUri ?? `${window.location.origin}/auth/callback`;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = randomString(24);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);
  sessionStorage.setItem(PKCE_RETURN_PATH_KEY, options?.returnPath ?? window.location.pathname);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  if (options?.scope?.trim()) {
    params.set('scope', options.scope.trim());
  }

  window.location.href = `${OPENROUTER_AUTH_URL}?${params.toString()}`;
}

function readAndValidatePKCEState(expectedState: string | null): string {
  const storedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

  if (!storedState || !codeVerifier) {
    throw new Error('Missing OAuth PKCE state. Start OpenRouter connection again.');
  }
  if (!expectedState || storedState !== expectedState) {
    throw new Error('OAuth state mismatch. Please retry OpenRouter connection.');
  }

  return codeVerifier;
}

async function exchangeAtEndpoint(
  endpoint: string,
  body: Record<string, string>
): Promise<{ access_token?: string; api_key?: string; key?: string } | null> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export async function exchangeCode(options: {
  code: string;
  state: string | null;
  clientId?: string;
  redirectUri?: string;
}): Promise<{ accessToken: string; returnPath: string }> {
  const clientId = options.clientId ?? import.meta.env.VITE_OPENROUTER_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing OpenRouter client ID. Set VITE_OPENROUTER_CLIENT_ID.');
  }

  const codeVerifier = readAndValidatePKCEState(options.state);
  const redirectUri = options.redirectUri ?? `${window.location.origin}/auth/callback`;
  const returnPath = sessionStorage.getItem(PKCE_RETURN_PATH_KEY) || '/settings';

  const payload = {
    grant_type: 'authorization_code',
    client_id: clientId,
    code: options.code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  };

  let token: string | null = null;
  for (const endpoint of OPENROUTER_TOKEN_ENDPOINTS) {
    const data = await exchangeAtEndpoint(endpoint, payload);
    if (!data) continue;
    token = data.access_token || data.api_key || data.key || null;
    if (token) break;
  }

  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_RETURN_PATH_KEY);

  if (!token) {
    throw new Error('OpenRouter token exchange failed. Please try again.');
  }

  return {
    accessToken: token,
    returnPath,
  };
}

export async function testOpenRouterKey(apiKey: string): Promise<boolean> {
  try {
    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'ScribRx',
      },
    });

    const { z } = await import('zod');
    await generateObject({
      model: openrouter(OPENROUTER_MODEL),
      schema: z.object({ ok: z.boolean() }),
      prompt: 'Return ok: true',
    });
    return true;
  } catch {
    return false;
  }
}
