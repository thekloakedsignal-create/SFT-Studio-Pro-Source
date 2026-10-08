---
name: together-ai-finetuning
description: Prepares and manages supervised fine-tuning jobs with Together AI's `tg` CLI. Use when the user asks to prepare, launch, monitor, or automate a Together AI fine-tuning run.
---

# Together AI Fine-Tuning

Use Together AI's official CLI (`tg`; `together` is an alias) for fine-tuning jobs. The CLI requires Python 3.10 or newer.

## Setup

If `tg` is unavailable, install it as an isolated tool rather than adding it to an application's dependencies:

```bash
uv tool install "together[cli]"
tg --help
```

Authenticate through the workspace's approved secret/environment-variable flow using `TOGETHER_API_KEY`. Never ask the user to paste a key into chat, print or inspect its value, place it in command arguments, or store it in project files.

## Prepare and launch

1. Confirm the training file, base model, optional validation file, and requested training settings with the user. Do not upload user data without their approval.
2. Validate the dataset:

   ```bash
   tg files check /path/to/training.jsonl
   ```

3. Prepare the command with the documented CLI:

   ```bash
   tg fine-tuning create --training-file /path/to/training.jsonl --model MODEL --suffix RUN_NAME
   ```

   Add `--validation-file /path/to/validation.jsonl` and only the training options the user selected. A local training or validation path is uploaded automatically when the job is submitted.
4. Before submission, show the exact command, confirm the dataset/model/settings, and obtain explicit approval for this run. The CLI displays an estimated price and asks for confirmation. Never add `--confirm`/`-y` to bypass that prompt unless the user explicitly approved submitting this specific job.

## Monitor and manage

- List jobs: `tg fine-tuning list`
- Read job status: `tg fine-tuning retrieve FT_ID`
- Read job events: `tg fine-tuning list-events FT_ID`
- Cancel: `tg fine-tuning cancel FT_ID` — ask for explicit approval before cancellation.

Report the job ID, current status, selected base model, and any available output model details. Do not start a job, upload data, skip a price prompt, or cancel a job merely because the user asked to automate a workflow; get approval for the specific external action.

## Documentation

- CLI setup: https://docs.together.ai/reference/cli/getting-started
- Fine-tuning CLI: https://docs.together.ai/reference/cli/finetune
