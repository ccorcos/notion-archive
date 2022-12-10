// TODO LATER:
// - child page mentions with [[wiki]] syntax.

import { Cache } from "./Cache"
import { Crawler } from "./Crawler"

async function main() {
	const cache = new Cache("data/cache.db")
	const crawler = new Crawler(cache)

	await crawler.crawlBlock("0e27612403084b2fb4a3166edafd623a")
	console.log("DONE")
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
