---
name: Billing scope
description: Owner exemption and separation of trainer formatting from payment gates.
---

The owner account bypasses all paygates, including training and example allowances.

**Why:** The user explicitly stated, “owner account bypasses all paygates.”

**How to apply:** Enforce the exemption using the verified owner identity on the server as well as hiding checkout in the UI. Do not rely on a browser-supplied role.

Automated training always requires ChatML Instruction with `<|im_start|>`, independently of payment.

**Why:** The user emphasized that formatting has nothing to do with the paygate and is required before training.

**How to apply:** Never let an owner or paid-account exemption bypass dataset formatting. Preserve existing provider requests and model settings when working on billing.

The one-time free 9B training code grants exactly one training credit, and a run funded by that code is not eligible for the free model-chat trial.

**Why:** The user explicitly requested one free training run without loading a chat model for that redeemed run.

**How to apply:** Track the promo credit through consumption and refunds, tag the resulting job, and exclude only promo-funded jobs from model-chat selection.

Model chat is available only after a completed training run consumed a paid training credit; promo-funded and owner-exempt runs do not qualify.

**Why:** The user explicitly requires payment for a full training run before the model-chat button can unlock.

**How to apply:** Enforce the paid-credit source on the server when selecting models and when handling status, start, and chat requests. Fail closed for older jobs without a recorded paid-credit source.
