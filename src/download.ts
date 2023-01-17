import { Cache } from "./Cache"
import { CachedApi } from "./CachedApi"
import { Crawler } from "./Crawler"
import { toUuid } from "./helpers/uuid"

const rootPageId = "0e27612403084b2fb4a3166edafd623a"

async function main() {
	const cache = new Cache("data/cache.db")
	const api = new CachedApi(cache)
	const crawler = new Crawler(api)
	await crawler.crawlPage(toUuid(rootPageId))
	console.log("DONE")
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
