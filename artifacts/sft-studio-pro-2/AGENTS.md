# Agent Guidelines & Persistent Rules

## Persistent Project Rules (DO NOT OVERRIDE)

1. **Model Selection Policy**:
   - **STRICTLY DIGITALOCEAN**: Use regular DigitalOcean GenAI Inference (`https://inference.do-ai.run/v1/chat/completions`) with `DIGITALOCEAN_API_KEY`.
   - Default primary model for all generation and quality assessment tasks: **`glm-3.5-flash`**.
   - Pure inference without synthesis tools.
   - Never call OpenAI or Anthropic directly; use the DigitalOcean inference infrastructure.

2. **Persistence Rules**:
   - Local project and batch copies are write-only backups. Preserve saves; never restore, merge, or migrate browser or local-file copies into active projects, generation inputs, or database records.

3. **No Automated Downgrades**:
   - Route all model inference through the DigitalOcean Gradient API. Use `DO_MODEL` for text requests and `DO_VISION_MODEL` for image OCR.

4. **Data Registry Approval Policy**:
   - All generated, converted, or imported batches MUST start with `status: "Pending"` and must NOT be added to the active Data Registry until explicitly reviewed and approved by the user.
   - **Exception**: TRiAD URL-import batches are the ONLY batches that enter the Data Registry directly as `Approved`.
