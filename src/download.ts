// TODO LATER:
// - child page mentions with [[wiki]] syntax.

import { Cache } from "./Cache"
import { CachedApi } from "./CachedApi"
import { Crawler } from "./Crawler"
import { uuid } from "./uuid"

async function main() {
	const cache = new Cache("data/cache.db")
	const crawler = new Crawler(new CachedApi(cache))
	await crawler.crawlBlock(uuid("0e27612403084b2fb4a3166edafd623a"))
	console.log("DONE")
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
