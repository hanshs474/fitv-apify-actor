// Minimal Free Image to Video API client (https://freeimagetovideo.ai). Auth: Authorization: Bearer sk-...
// Every answer is an envelope {code, message, data}; success = HTTP < 400 AND code === 0.
export const BASE_URL = (process.env.FREEIMAGETOVIDEO_BASE_URL || 'https://freeimagetovideo.ai').replace(/\/+$/, '');
export const KEYS_URL = 'https://freeimagetovideo.ai/settings/apikeys';
export const MODEL = 'minimax-h3';
export const DURATIONS = [4, 5, 6, 8, 10, 15];
export const RESOLUTIONS = ['480p', '768p'];
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1'];

export class FitvError extends Error {
    constructor(message, kind = 'api', { status, code, reason, taskId } = {}) {
        super(message);
        this.kind = kind; // auth | quota | plan | busy | rejected | generation | timeout | api
        this.status = status;
        this.code = code;
        this.reason = reason;
        this.taskId = taskId;
    }
}

// Same order as the Go reference (fitv.go Classify).
export function classify(status, env = {}) {
    const msg = String(env?.message || `request failed (HTTP ${status})`);
    const code = typeof env?.code === 'number' ? env.code : 0;
    const reason = env?.data && typeof env.data === 'object' ? env.data.reason : undefined;
    const kind = status === 401 ? 'auth'
        : code === -2 || code === -3 ? 'rejected'
        : reason === 'insufficient_credits' ? 'quota'
        : reason === 'plan_required' ? 'plan'
        : reason === 'concurrency' ? 'busy'
        : msg.toLowerCase().includes('no auth') ? 'auth'
        : 'api';
    return new FitvError(msg, kind, { status, code, reason });
}

export function parseEnvelope(status, env) {
    if (env === null) {
        if (status === 401) return classify(401, {});
        return new FitvError(`freeimagetovideo.ai returned a non-JSON response (HTTP ${status})`, 'api', { status });
    }
    if (status < 400 && env?.code === 0) return env;
    return classify(status, env);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Network errors (and 5xx without an envelope) are retried; real API answers are returned as they are.
export async function post(path, body, apiKey, { fetchImpl = fetch, tries = 4, backoffMs = 1500 } = {}) {
    if (!apiKey) throw new FitvError(`add your API key (create one at ${KEYS_URL})`, 'auth');
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetchImpl(BASE_URL + path, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, 'user-agent': 'fitv-apify-actor/0.1.0' },
                body: body == null ? undefined : JSON.stringify(body),
            });
            let env = null;
            try { env = await res.json(); } catch { /* non-JSON page */ }
            if (env === null && res.status >= 500 && i < tries - 1) throw new Error(`HTTP ${res.status}`);
            const out = parseEnvelope(res.status, env);
            if (out instanceof FitvError) throw out;
            return out;
        } catch (err) {
            if (err instanceof FitvError) throw err;
            lastErr = err;
            if (i < tries - 1) await sleep(backoffMs * (i + 1));
        }
    }
    throw new FitvError(`could not reach freeimagetovideo.ai: ${lastErr?.message ?? lastErr}`, 'api');
}

export function buildBody(prompt, { imageUrl, duration, resolution, aspectRatio } = {}) {
    const options = { sound: true };
    if (duration) options.duration = Number(duration);
    if (resolution) options.resolution = resolution;
    if (aspectRatio) options.aspect_ratio = aspectRatio;
    let scene = 'text-to-video';
    if (imageUrl) {
        options.image_input = [imageUrl];
        scene = 'image-to-video';
    }
    return { provider: 'auto', mediaType: 'video', model: MODEL, scene, prompt, options };
}

export async function submit(apiKey, prompt, settings, opts) {
    if (!String(prompt ?? '').trim()) throw new FitvError('prompt is required', 'api');
    const env = await post('/api/ai/generate', buildBody(prompt, settings), apiKey, opts);
    const id = env.data?.id;
    if (id === undefined || id === null || id === '') throw new FitvError('freeimagetovideo.ai accepted the run but returned no id', 'api');
    return String(id);
}

export async function status(apiKey, taskId, opts) {
    const env = await post('/api/ai/query', { taskId }, apiKey, opts);
    return env.data ?? {};
}

export async function credits(apiKey, opts) {
    const env = await post('/api/user/get-user-credits', null, apiKey, opts);
    return Number(env.data?.remainingCredits ?? 0);
}

// Status is not monotonic (processing -> pending -> success); only success / failed / canceled end the wait.
export async function waitFor(apiKey, taskId, timeoutMs, { pollMs = 10000, onTick, ...opts } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
        let t;
        try {
            t = await status(apiKey, taskId, opts);
        } catch (e) {
            if (e.kind === 'auth' || e.kind === 'plan') throw e;
            // a dropped poll is not a failed generation
        }
        if (t?.status === 'success') {
            const url = Array.isArray(t.videos) ? t.videos[0] : undefined;
            if (!url) throw new FitvError('finished with no video', 'generation', { taskId });
            return { videoUrl: String(url), task: t };
        }
        if (t?.status === 'failed' || t?.status === 'canceled') {
            const e = new FitvError(`run ${taskId} ${t.status}: ${t.errorMessage || 'no error message'}`, 'generation', { taskId });
            e.failureKind = t.failureKind;
            throw e;
        }
        onTick?.(t);
        if (Date.now() + pollMs > deadline) throw new FitvError(`still generating; run ${taskId} may still finish in your library on freeimagetovideo.ai`, 'timeout', { taskId });
        await sleep(pollMs);
    }
}
