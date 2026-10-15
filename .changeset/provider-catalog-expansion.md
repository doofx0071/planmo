---
'@planmo/ai': minor
'planmo': minor
---

Add the OpenCode Console provider preset (OpenAI-compatible, credential env `OPENCODE_API_KEY`, with its declared `GET https://opencode.ai/inference/v1/models` list endpoint), and label every row of `planmo provider list` as `runtime-supported` while reporting the coding-agent and candidate-catalog counts separately so a candidate is never read as a provider.
