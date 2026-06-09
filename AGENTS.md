
## Product Boundary And Mutation Policy (2026-06-02)
- The tracked GitHub/remote product for `D:/quailbot-pi` should contain only Quailbot Pi plugin product code.
- Internal construction scaffolding such as the RPC bridge, task packets, dummy drivers, import helpers, and other development-only assets live under `.opencode/artifacts/...` and remain untracked.
- Do not track `scripts/run-pi.mjs`, `scripts/import-nanonis-workspace.mjs`, or other task/instrument-specific helper scripts as product code.
- Real imported workspaces may exist locally/gitignored for verification, but product logic must stay workspace/driver/instrument agnostic.
- Mutation gating is domain-generic: the allow/deny control gates mutating tools (`cli_set`, `cli_ramp`, `cli_action`, `click_anchor`, `set_field`) rather than hardcoding a specific instrument, task, or driver name.
- Tools are fixed product surface under `src/tools/`; workspace data informs prompt/runtime contracts and driver/parameter selection, but does not generate tool names.
- Linked-observable forced readback is separate from ordinary tool results: after mutating actions, resolve workspace-declared linked observables, perform readback, and inject/return those observations separately.
- `quailbot_planwrite` and `quailbot_plan_and_execute` are product tools under `src/tools/`; `quailbot_plan_and_execute` runs programmatically and sequentially after submission, performs per-step linked-observable readback for mutating steps, and returns one final ordered tool result.
