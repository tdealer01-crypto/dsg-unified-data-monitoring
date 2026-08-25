import crypto from 'node:crypto';
import { forwardPostDeployFeedback } from '../src/control-plane-feedback';

describe('forwardPostDeployFeedback', () => {
  test('HMAC-signs the exact JSON body sent to Control Plane', async () => {
    const envelope = {
      monitoring: { status: 'PASS' },
      promotionReceipt: { promotionId: 'promotion-1' },
      deployment: { deploymentId: 'deploy-1' },
    };
    const secret = 'feedback-secret';
    let capturedBody = '';
    let capturedSignature = '';

    const result = await forwardPostDeployFeedback(
      'https://control.example.com/api/dsg/agentic-org/post-deploy',
      secret,
      envelope,
      async (_input, init) => {
        capturedBody = String(init?.body || '');
        const headers = init?.headers as Record<string, string>;
        capturedSignature = headers['x-dsg-signature'];
        return new Response(JSON.stringify({ status: 'PASS' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );

    const expected = crypto.createHmac('sha256', secret).update(capturedBody).digest('hex');
    expect(capturedBody).toBe(JSON.stringify(envelope));
    expect(capturedSignature).toBe(`sha256=${expected}`);
    expect(result).toEqual({ httpStatus: 200, ok: true, body: { status: 'PASS' } });
  });

  test('rejects non-HTTPS Control Plane bindings', async () => {
    await expect(forwardPostDeployFeedback(
      'http://control.example.com/api/dsg/agentic-org/post-deploy',
      'secret',
      { monitoring: {}, promotionReceipt: {}, deployment: {} },
    )).rejects.toThrow('CONTROL_PLANE_FEEDBACK_URL_MUST_BE_HTTPS');
  });

  test('preserves fail-closed HTTP responses from Control Plane', async () => {
    const result = await forwardPostDeployFeedback(
      'https://control.example.com/api/dsg/agentic-org/post-deploy',
      'secret',
      { monitoring: {}, promotionReceipt: {}, deployment: {} },
      async () => new Response(JSON.stringify({ status: 'BLOCK', reason: 'PRODUCTION_TARGET_UNBOUND' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(409);
    expect(result.body).toEqual({ status: 'BLOCK', reason: 'PRODUCTION_TARGET_UNBOUND' });
  });
});
