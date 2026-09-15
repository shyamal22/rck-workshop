# Tests

Browser tests that drive the real app in headless Chromium against a stand-in
for Supabase. Each file is standalone:

    npm i playwright        # once, anywhere on NODE_PATH
    node tests/crew.js

They print one line per check and end with `ALL … CHECKS PASSED` or `FAILED`.
