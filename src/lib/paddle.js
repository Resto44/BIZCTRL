import { initializePaddle } from '@paddle/paddle-js';
import { getApplicationBaseUrl } from '@/lib/appUrl';

const PADDLE_LIVE = 'production';
const LIVE_TOKEN_PATTERN = /^live_[A-Za-z0-9]{27}$/;
const PADDLE_CUSTOMER_ID_PATTERN = /^ctm_[a-z\d]{26}$/i;

let paddlePromise = null;
let initializedCustomerId = null;

export class PaddleConfigurationError extends Error {
  constructor(message = 'Paddle live checkout is not configured yet.') {
    super(message);
    this.name = 'PaddleConfigurationError';
  }
}

export function paddleEnvironment() {
  return String(import.meta.env.VITE_PADDLE_ENVIRONMENT || PADDLE_LIVE).trim().toLowerCase();
}

export function paddleClientToken() {
  return String(import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '').trim();
}

export function isPaddleClientConfigured() {
  return paddleEnvironment() === PADDLE_LIVE && LIVE_TOKEN_PATTERN.test(paddleClientToken());
}

function normalizedCustomerId(value) {
  const customerId = String(value || '').trim();
  return PADDLE_CUSTOMER_ID_PATTERN.test(customerId) ? customerId : null;
}

async function synchronizePaddleCustomer(paddle, customerId) {
  const safeCustomerId = normalizedCustomerId(customerId);
  if (!safeCustomerId || safeCustomerId === initializedCustomerId) return;
  paddle.Update({ pwCustomer: { id: safeCustomerId } });
  initializedCustomerId = safeCustomerId;
}

export async function getPaddle(paddleCustomerId = null) {
  if (paddleEnvironment() !== PADDLE_LIVE) {
    throw new PaddleConfigurationError('BizCTRL accepts Paddle live configuration only in this release.');
  }

  const token = paddleClientToken();
  if (!LIVE_TOKEN_PATTERN.test(token)) {
    throw new PaddleConfigurationError('Paddle live checkout is awaiting its verified client-side token.');
  }

  const safeCustomerId = normalizedCustomerId(paddleCustomerId);
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      token,
      pwCustomer: safeCustomerId ? { id: safeCustomerId } : {},
    }).then((paddle) => {
      if (!paddle) throw new PaddleConfigurationError('Paddle.js could not initialize.');
      initializedCustomerId = safeCustomerId;
      return paddle;
    }).catch((error) => {
      paddlePromise = null;
      initializedCustomerId = null;
      throw error;
    });
  }

  const paddle = await paddlePromise;
  await synchronizePaddleCustomer(paddle, safeCustomerId);
  return paddle;
}

export async function openPaddleTransaction(transactionId, paddleCustomerId = null) {
  const safeTransactionId = String(transactionId || '').trim();
  if (!/^txn_[a-z\d]{26}$/i.test(safeTransactionId)) {
    throw new PaddleConfigurationError('Paddle returned an invalid checkout transaction.');
  }

  const paddle = await getPaddle(paddleCustomerId);
  paddle.Checkout.open({
    transactionId: safeTransactionId,
    settings: {
      displayMode: 'overlay',
      theme: 'light',
      successUrl: `${getApplicationBaseUrl()}/billing?checkout=paddle-pending`,
    },
  });
}
