import crypto from 'node:crypto';

export interface ControlPlaneFeedbackEnvelope {
  monitoring: unknown;
  promotionReceipt: unknown;
  deployment: unknown;
}

export interface ControlPlaneFeedbackResult {
  httpStatus: number;
  ok: boolean;
  body: unknown;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function forwardPostDeployFeedback(
  url: string,
  secret: string,
  envelope: ControlPlaneFeedbackEnvelope,
  fetcher: FetchLike = fetch,
): Promise<ControlPlaneFeedbackResult> {
  if (!url.startsWith('https://')) {
    throw new Error('CONTROL_PLANE_FEEDBACK_URL_MUST_BE_HTTPS');
  }
  if (!secret.trim()) {
    throw new Error('CONTROL_PLANE_FEEDBACK_SECRET_MISSING');
  }

  const rawBody = JSON.stringify(envelope);
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dsg-signature': `sha256=${signature}`,
    },
    body: rawBody,
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    body,
  };
}
