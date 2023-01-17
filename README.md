# Notion Archive

Create a static HTML archive from a Notion page or workspace.

## To Do

- [ ] download images and files
- [ ] render page properties.
- [ ] table properties order by type heuristic.
- [ ] youtube embeds
- [ ] KaTeX

- [ ] Better CSS styles
- [ ] url slugs.


- [ ] end-to-end tests: make a page with every kind of block

## Architecture

- `api.ts` is a simplified abstraction on top of the Notion API.
- `Crawler.ts` will traverse the block tree.
- `Cache.ts` saves block data into SQLite.
- `CachedApi.ts` is the same API abstraction but fetched blocks from the cache instead of the network.
- `download.ts` will run the crawler and save any missing blocks into the cache. When this script is re-run, it will skip any blocks that have already been fetched and appear in the cache.
- `render.ts` renders blocks from the cache into plain semantic HTML.

## Getting Started

- Put your Notion API token in `token.txt` in the root of this project.
- Specify the `rootPageId` in download.
- `npm run download`
- `npm run render`