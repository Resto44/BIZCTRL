import { initializePaddle } from '@paddle/paddle-js';
import { getApplicationBaseUrl } from '@/lib/appUrl';

const PADDLE_SANDBOX = 'sandbox';
const SANDBOX_TOKEN_PATTERN = /^test_[A-Za-z0-9]{27}$/;

let paddlePromise = null;

export class PaddleSandboxConfigurationError extends Error {
  constructor(message = 'Paddle Sandbox checkout is not configured yet.') {
    super(message);
    this.name = 'PaddleSandboxConfigurationError';
  }
}

export function paddleEnvironment() {
  return String(import.meta.env.VITE_PADDLE_ENVIRONMENT || PADDLE_SANDBOX).trim().toLowerCase();
}

export function paddleSandboxClientToken() {
  return String(import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '').trim();
}

export function isPaddleSandboxClientConfigured() {
  return paddleEnvironment() === PADDLE_SANDBOX && SANDBOX_TOKEN_PATTERN.test(paddleSandboxClientToken());
}

export async function getPaddleSandbox() {
  if (paddleEnvironment() !== PADDLE_SANDBOX) {
    throw new PaddleSandboxConfigurationError('BizCTRL accepts Paddle Sandbox configuration only in this release.');
  }

  const token = paddleSandboxClientToken();
  if (!SANDBOX_TOKEN_PATTERN.test(token)) {
    throw new PaddleSandboxConfigurationError('Paddle Sandbox checkout is awaiting its verified client-side token.');
  }

  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      environment: PADDLE_SANDBOX,
      token,
    }).then((paddle) => {
      if (!paddle) throw new PaddleSandboxConfigurationError('Paddle.js could not initialize.');
      return paddle;
    }).catch((error) => {
      paddlePromise = null;
      throw error;
    });
  }

  return paddlePromise;
}

export async function openPaddleSandboxTransaction(transactionId) {
  const safeTransactionId = String(transactionId || '').trim();
  if (!/^txn_[a-z\d]{26}$/i.test(safeTransactionId)) {
    throw new PaddleSandboxConfigurationError('Paddle returned an invalid checkout transaction.');
  }

  const paddle = await getPaddleSandbox();
  paddle.Checkout.open({
    transactionId: safeTransactionId,
    settings: {
      displayMode: 'overlay',
      theme: 'light',
      successUrl: `${getApplicationBaseUrl()}/billing?checkout=paddle-pending`,
    },
  });
}
