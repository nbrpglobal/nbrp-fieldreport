# Field Report — Cloudflare deploy

## Recommended: Cloudflare Pages (static)

1. Push these files to the **root** of your GitHub repo (index.html must be at repo root).
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect Git.
3. Settings:
   - **Framework preset:** None
   - **Build command:** leave **empty**
   - **Build output directory:** `/` or `.`
   - **Root directory:** `/` (repo root)
4. Save and deploy.

Do **NOT** use deploy command `npx wrangler deploy` unless wrangler.toml is present (included).

## Alternative: Wrangler static assets

```bash
npx wrangler deploy
```

Requires `wrangler.toml` with `[assets] directory = "."` (included).

## After deploy

Run `supabase-init.sql` in Supabase SQL Editor once.
