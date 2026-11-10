import test from 'node:test';
import assert from 'node:assert';
import { submit, waitFor, buildBody, classify, parseEnvelope, credits, post, FitvError } from './src/fitv.js';

// fake fetch: each step is [status, body] (body null = non-JSON page) or an Error to throw
const fake = (seq, calls = []) => { let i = 0; return async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization });
    const step = seq[Math.min(i++, seq.length - 1)];
    if (step instanceof Error) throw step;
    const [status, body] = step;
    return { status, json: async () => { if (body === null) throw new SyntaxError('not json'); return body; } };
}; };
const fast = { pollMs: 1, backoffMs: 1 };

test('body: text to video vs image to video', () => {
    const t = buildBody('p', { duration: 5, resolution: '480p', aspectRatio: '9:16' });
    assert.deepEqual(t, { provider: 'auto', mediaType: 'video', model: 'minimax-h3', scene: 'text-to-video', prompt: 'p', options: { sound: true, duration: 5, resolution: '480p', aspect_ratio: '9:16' } });
    const i = buildBody('p', { imageUrl: 'https://x/a.jpg' });
    assert.equal(i.scene, 'image-to-video');
    assert.deepEqual(i.options.image_input, ['https://x/a.jpg']);
});

test('submit + wait; status is not monotonic', async () => {
    const calls = [];
    const id = await submit('sk-k', 'p', {}, { fetchImpl: fake([[200, { code: 0, message: 'ok', data: { id: 't1' } }]], calls), ...fast });
    assert.equal(id, 't1');
    assert.equal(calls[0].url, 'https://freeimagetovideo.ai/api/ai/generate');
    assert.equal(calls[0].auth, 'Bearer sk-k');
    const r = await waitFor('sk-k', 't1', 5000, { ...fast, fetchImpl: fake([
        [200, { code: 0, data: { id: 't1', status: 'processing' } }],
        [200, { code: 0, data: { id: 't1', status: 'pending', queued: true, queueEta: 30 } }],
        new TypeError('fetch failed'),
        [200, { code: 0, data: { id: 't1', status: 'success', videos: ['https://cdn/v.mp4'] } }],
    ]) });
    assert.equal(r.videoUrl, 'https://cdn/v.mp4');
});

test('failed / canceled end with a generation error', async () => {
    await assert.rejects(waitFor('k', 't', 5000, { ...fast, fetchImpl: fake([[200, { code: 0, data: { status: 'failed', errorMessage: 'boom', failureKind: 'provider' } }]]) }),
        (e) => e.kind === 'generation' && /boom/.test(e.message) && e.failureKind === 'provider');
    await assert.rejects(waitFor('k', 't', 5000, { ...fast, fetchImpl: fake([[200, { code: 0, data: { status: 'canceled' } }]]) }), (e) => e.kind === 'generation');
    await assert.rejects(waitFor('k', 't', 5000, { ...fast, fetchImpl: fake([[200, { code: 0, data: { status: 'success', videos: [] } }]]) }), (e) => e.kind === 'generation');
});

test('timeout', async () => {
    await assert.rejects(waitFor('k', 't', 5, { pollMs: 10, fetchImpl: fake([[200, { code: 0, data: { status: 'processing' } }]]) }), (e) => e.kind === 'timeout');
});

test('classify: HTTP 200 with code != 0 is a refusal, not success', () => {
    assert.equal(classify(401, {}).kind, 'auth');
    assert.equal(classify(200, { code: -2, message: 'blocked' }).kind, 'rejected');
    assert.equal(classify(200, { code: -3 }).kind, 'rejected');
    assert.equal(classify(200, { code: -1, data: { reason: 'insufficient_credits' } }).kind, 'quota');
    assert.equal(classify(200, { code: -1, data: { reason: 'plan_required' } }).kind, 'plan');
    assert.equal(classify(200, { code: -1, data: { reason: 'concurrency' } }).kind, 'busy');
    assert.equal(classify(200, { code: -1, message: 'no auth, please sign in' }).kind, 'auth');
    assert.equal(classify(500, { code: -1, message: 'x' }).kind, 'api');
    assert.ok(parseEnvelope(200, { code: -1 }) instanceof FitvError);
    assert.equal(parseEnvelope(401, null).kind, 'auth');
    assert.equal(parseEnvelope(502, null).kind, 'api');
});

test('network errors are retried, then reported', async () => {
    const calls = [];
    assert.equal(await credits('k', { ...fast, fetchImpl: fake([new TypeError('reset'), [200, { code: 0, data: { remainingCredits: 42 } }]], calls) }), 42);
    assert.equal(calls.length, 2);
    await assert.rejects(post('/x', {}, 'k', { ...fast, tries: 2, fetchImpl: fake([new TypeError('down')]) }), (e) => e.kind === 'api' && /could not reach/.test(e.message));
    await assert.rejects(post('/x', {}, '', fast), (e) => e.kind === 'auth');
});

test('live: wrong key -> auth', async () => {
    await assert.rejects(submit('sk-invalid-key-for-test', 'a lantern on a river', { duration: 5 }), (e) => { console.log('live:', e.kind, e.status, e.message); return e.kind === 'auth'; });
});
