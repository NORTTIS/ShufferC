# Manual Verify — AI Content-Authoring Tools (Gemini function calling)

Jest never touches the network; `generateWithTools` against real Gemini is smoke-tested by hand.

## Prereqs
- `.env` has a valid `GEMINI_API_KEY` (and the Pro model configured).
- Server running: `npm run dev`. Admin console at `http://localhost:3000/admin`.

## Steps
1. Log in to the admin console.
2. Generate a route from a novel/context whose scenes imply NEW creatures or gear not in the
   current registry (e.g. an arctic chapter with frost monsters), title it "Frost Trial".
3. Expected: generation returns 200 with a draft. The route detail shows a gold
   "New content this route will add on publish" banner listing AI-created effects/enemies/items.
4. Inspect the bundle JSON (`viewOut`): `stagedContent` contains the new entities; node `combat`
   blocks reference their ids; existing ids were reused where sensible.
5. Publish → accept the confirmation → verify the new entities now appear in the content tables
   and the banner disappears from the route.
6. Negative: generate again with a context that forces an id already in the registry; if a
   collision occurs at publish, expect a 409 surfaced as "Publish failed: … already exists",
   with the draft left intact.

## Notes
- If generation never calls `submit_route` within `maxToolCalls` (30), the endpoint returns 422
  with collected errors — re-run; transient model behavior.
