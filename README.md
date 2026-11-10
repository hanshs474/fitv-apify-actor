# Free Image to Video: Image to Video AI with Sound

Free image to video AI with no daily cap: start with no sign-up, keep going on a free account. Every video comes with sound and no watermark. This is the official Apify Actor for [Free Image to Video](https://freeimagetovideo.ai/?utm_source=apify&utm_medium=package): give it a photo and a prompt (or just a prompt) plus your own API key, and it writes the finished clip's URL to the dataset.

## What you get

| | |
|---|---|
| Input | Your Free Image to Video API key, a prompt, an optional image URL, and clip settings |
| Modes | [Image to video AI with sound](https://freeimagetovideo.ai/video/image-to-video-ai-with-sound?utm_source=apify&utm_medium=package) when you give an image URL (the photo is the first frame); [free text to video AI](https://freeimagetovideo.ai/video/free-text-to-video-ai?utm_source=apify&utm_medium=package) when you leave it empty |
| Model | MiniMax H3, with sound on every clip |
| Output | One dataset row: `videoUrl`, `taskId`, `status`, the settings used, and `error` / `errorKind` if the run failed |
| Cost | Apify platform usage for the run. Generation runs on your Free Image to Video plan ([plans](https://freeimagetovideo.ai/pricing?utm_source=apify&utm_medium=package)) |

## Before you run it

1. Sign in on the site and create an API key at https://freeimagetovideo.ai/settings/apikeys (it starts with `sk-`).
2. Paste it into **Free Image to Video API key**. The field is stored as a secret input and is only sent to freeimagetovideo.ai.

API runs need a paid plan: they draw on the plan's daily full-speed allowance, then wait in the relaxed queue. To try it by hand first, you can [animate a photo](https://freeimagetovideo.ai/video/animate-photo-ai?utm_source=apify&utm_medium=package) on the website with no sign-up.

## Input

```json
{
  "apiKey": "sk-...",
  "prompt": "the camera slowly pushes in while the lantern light flickers and the river flows past",
  "imageUrl": "https://example.com/lantern.jpg",
  "duration": "5",
  "resolution": "480p",
  "aspectRatio": "16:9",
  "timeoutSecs": 1800
}
```

- `duration`: 4, 5, 6, 8, 10 or 15 seconds.
- `resolution`: `480p` or `768p`.
- `aspectRatio`: `16:9`, `9:16` or `1:1`.
- `imageUrl`: a public https image. Leave it out for text to video.

## Output

```json
{
  "prompt": "the camera slowly pushes in while the lantern light flickers and the river flows past",
  "imageUrl": "https://example.com/lantern.jpg",
  "scene": "image-to-video",
  "model": "minimax-h3",
  "options": { "duration": 5, "resolution": "480p", "aspect_ratio": "16:9" },
  "taskId": "...",
  "status": "success",
  "videoUrl": "https://...",
  "error": null,
  "errorKind": null
}
```

## Good to know

- **A run can queue.** Once the plan's full-speed allowance for the day is used, runs wait in the relaxed queue. The Actor checks every 10 seconds; `timeoutSecs` caps the wait, and a run that outlasts it still lands in your library on the site.
- **A failed run still writes its row.** `errorKind` says what happened: `auth` (key missing or wrong), `plan` (API runs need a paid plan), `quota` (not enough credits), `busy` (too many runs at once), `rejected` (the content filter refused the prompt), `generation` (the run failed), `timeout`, or `api`. The Actor run is then marked failed, so schedules and integrations notice.
- **Dropped connections are retried.** A network blip while submitting or checking is retried; it is never reported as a failed generation.

Also available as a hosted MCP server at `https://freeimagetovideo.ai/api/mcp` for AI agents.

## Source

MIT licensed: https://github.com/hanshs474/fitv-apify-actor
