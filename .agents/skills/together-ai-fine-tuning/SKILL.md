---
name: together-ai-fine-tuning
description: Prepares, starts, and monitors Together AI fine-tuning jobs with the Together CLI. Use when the user asks to plan or manage a Together AI fine-tune.
---

# Together AI Fine-Tuning

Use the Together CLI (`tg`) for dataset checks, fine-tuning preflight, job creation, and monitoring. Keep dataset preparation separate from upload and job submission. Never start a run, deploy a model, or take another cost-incurring action without the user's explicit approval for the specific action and its expected cost.

## Safety boundaries

- Local inspection and validation are not permission to upload data or start a job. Ask before sending a dataset to Together AI.
- Before submitting a job, show the user the base model (or checkpoint), dataset IDs, training method/type, epochs, evaluation settings, and current estimated price. Get an unambiguous approval in chat for those exact settings and that cost.
- Obtain the estimate without creating a job, using Together's job-price estimate endpoint or the new-job page. If no reliable estimate is available, do not submit; explain what is missing and ask how the user wants to proceed.
- After approval, run `tg fine-tuning create` without `--confirm`/`-y`. The CLI's own price-confirmation prompt is a second safeguard. If its displayed estimate or settings differ from what the user approved, decline and ask again.
- Never use `--confirm`/`-y` to bypass the CLI prompt, including in scripts or CI. Do not assume the CLI prompt alone is user approval.
- `tg fine-tuning create --training-file <PATH>` uploads that local file automatically and then creates the job. To keep data transfer separate from paid training, obtain upload approval, upload explicitly, wait for server-side validation, and pass the returned file ID to `create`.
- Fine-tuning is billed by processed training and validation tokens; dedicated-endpoint hosting is a separate, ongoing cost. Do not deploy a model unless requested and separately approved.
- Do not ask the user to paste an API key or print, inspect, store, or pass it as a command-line argument. Use an already configured `TOGETHER_API_KEY` environment variable. On Replit, follow the `environment-secrets` skill if the secret needs configuring. Never echo it or include it in logs, files, or shell history.
- Do not delete uploaded files or fine-tuning jobs without explicit user approval.

## Prepare a run

1. Confirm the requested task, dataset location, target model, and whether this is SFT or preference fine-tuning. Use only data the user authorized you to inspect. Do not silently alter or fabricate examples.
2. Confirm CLI availability and inspect help if needed:

   ```bash
   tg --version
   tg fine-tuning --help
   ```

   The official CLI currently requires Python 3.10+; its documented install is `uv tool install "together[cli]"`. Ask before installing tools or changing the environment.
3. Choose a dataset format that matches the task. For JSONL, each line must be one JSON object. Common forms are conversational (`messages`), instruction (`prompt` and `completion`), generic text (`text`), and preference (`input`, `preferred_output`, and `non_preferred_output`). Use Together's data-preparation guide for exact schema rules; do not mix formats in one file.
4. Run the local structural check before upload:

   ```bash
   tg files check ./train.jsonl --json
   ```

   A passing local check does not prove that the full training schema is valid. Stop and fix reported errors before proceeding.
5. Confirm the model is currently supported, then inspect its actual limits rather than assuming defaults:

   ```bash
   tg fine-tuning model-limits "MODEL_ID"
   ```

   Use the supported-models guide for current model availability. Do not rely on model IDs or limits copied from old examples.
6. Ask for approval before uploading data. Once approved, upload and save the returned file ID:

   ```bash
   tg files upload ./train.jsonl
   ```

   The default purpose is `fine-tune`. Uploading transfers the dataset to Together AI; do not use `--no-check` to skip local validation.
7. Wait for Together's server-side ingestion to finish before estimating or starting training:

   ```bash
   tg files retrieve "FILE_ID" --json
   ```

   Check `processing_status`; proceed only when it is `COMPLETED`. If it is `INVALID_FORMAT`, read the validation report, correct the local source, and obtain approval before uploading a replacement.
8. Preview tokenization and training-loss masking on the uploaded data:

   ```bash
   tg fine-tuning preview --model "MODEL_ID" --training-file "FILE_ID"
   ```

   Resolve unexpected truncation, format detection, or trained-token spans before proposing a run.
9. Obtain a price estimate without creating the job. Use the official estimate-price endpoint or Together's new-job page with the validated file and intended parameters. Training is billed by tokens processed across training and validation; the official pricing guide documents the formula and current rates. Then present the complete run configuration and estimate to the user and request explicit approval.

## Start only after approval

After approval for the exact estimated cost and settings, submit with the uploaded file ID (not a local path):

```bash
tg fine-tuning create \
  --training-file "FILE_ID" \
  --model "MODEL_ID" \
  --training-method sft \
  --lora
```

Adjust options only to the approved configuration. `sft` is the default method; LoRA is generally the default training type, but specify the intended choice clearly. Use `--from-checkpoint` instead of `--model` only when the user asked to continue an existing run. Do not add `--confirm`/`-y`. If the CLI's displayed estimate is unavailable or differs from the approved estimate, do not confirm the prompt.

Record the returned `ft-…` job ID for status checks. If submission reports an error or times out, check `tg fine-tuning list` before retrying so an accepted job is not duplicated.

## Check status

Use the job ID returned by the CLI; never guess one:

```bash
tg fine-tuning retrieve "FT_ID"
tg fine-tuning list-events "FT_ID"
```

Use `tg fine-tuning list` to find existing jobs when the user asks. Report the current status and relevant event/error details. Jobs can move through `pending`, `queued`, `running`, `uploading`, and `completed`; `error` and `cancelled` are terminal outcomes. Poll at a reasonable interval only when the user asks for ongoing monitoring. Do not cancel, delete, download, deploy, or otherwise mutate the run unless requested; obtain approval before any action that could incur cost.

## Verified official references

Workflow and command names were checked against Together AI's official documentation on 2026-10-08:

- [CLI installation and authentication](https://docs.together.ai/reference/cli/getting-started)
- [Fine-tuning CLI reference](https://docs.together.ai/reference/cli/finetune)
- [Files CLI reference](https://docs.together.ai/reference/cli/files)
- [Fine-tuning quickstart](https://docs.together.ai/docs/fine-tuning/quickstart)
- [Data preparation and validation](https://docs.together.ai/docs/fine-tuning/data-preparation)
- [Fine-tuning pricing and estimates](https://docs.together.ai/docs/fine-tuning/pricing)
- [Supported models](https://docs.together.ai/docs/fine-tuning/supported-models)

The CLI reference lists a 25 GB limit for fine-tuning file arguments, while the general data-preparation guide currently states a 100 GB file limit. Do not promise either limit for a particular job; check the live CLI/model requirements before handling large files.
