import { Actor, log } from 'apify';
import { submit, waitFor, buildBody, FitvError, KEYS_URL, MODEL } from './fitv.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const apiKey = String(input.apiKey ?? '').trim();
const prompt = String(input.prompt ?? '').trim();
const settings = {
    imageUrl: String(input.imageUrl ?? '').trim() || undefined,
    duration: Number(input.duration ?? 5) || 5,
    resolution: input.resolution ?? '480p',
    aspectRatio: input.aspectRatio ?? '16:9',
};
const timeoutSecs = Number(input.timeoutSecs ?? 1800);
const body = buildBody(prompt, settings);

const row = {
    prompt,
    imageUrl: settings.imageUrl ?? null,
    scene: body.scene,
    model: MODEL,
    options: { duration: body.options.duration, resolution: body.options.resolution, aspect_ratio: body.options.aspect_ratio },
    taskId: null,
    status: null,
    videoUrl: null,
    error: null,
    errorKind: null,
};

try {
    if (!apiKey) throw new FitvError(`add your Free Image to Video API key (create one at ${KEYS_URL})`, 'auth');
    if (!prompt) throw new FitvError('add a prompt', 'api');
    row.taskId = await submit(apiKey, prompt, settings);
    log.info(`Submitted ${row.scene} run ${row.taskId}`);
    const { videoUrl, task } = await waitFor(apiKey, row.taskId, timeoutSecs * 1000, {
        onTick: (t) => log.info(`${row.taskId}: ${t?.status ?? 'no answer'}${t?.queued ? ` (queued, eta ${Math.round(t.queueEta ?? 0)}s)` : ''}`),
    });
    row.status = task.status;
    row.videoUrl = videoUrl;
    log.info(`Done: ${videoUrl}`);
} catch (err) {
    row.status = row.status ?? (err.kind === 'timeout' ? 'timeout' : 'failed');
    row.error = err.message;
    row.errorKind = err instanceof FitvError ? err.kind : 'api';
    if (err.failureKind) row.failureKind = err.failureKind;
    log.warning(`${row.errorKind}: ${err.message}`);
}

// A failed run still writes its row, so the dataset always says what happened.
await Actor.pushData(row);
await Actor.setValue('OUTPUT', row);

if (row.error) await Actor.fail(`${row.errorKind}: ${row.error}`);
else await Actor.exit();
