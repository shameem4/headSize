# headSize — static demo

The project was reset to a simple static HTML demo. The original React/Vite app
and build artifacts were removed to keep this repository minimal.

What remains

- `index.html` — the static demo (includes a 1280×720 canvas with a tiny draw loop)
- README and simple metadata files

How to run locally

- With Python 3 (built-in):

```bash
python -m http.server 5173

# then open http://localhost:5173
```

- With npx (no global install):

```bash
npx http-server -c-1 . -p 5173

# then open http://localhost:5173
```

If you want the original React source restored I can recover it from git; let me
know and I'll restore or create a backup before further deletions.
