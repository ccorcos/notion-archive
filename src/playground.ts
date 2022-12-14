import { Cache } from "./Cache"
import { toUuid } from "./helpers/uuid"

async function main() {
	const cache = new Cache("data/cache2.db")
	console.log(cache.api.getPage(toUuid("2be911cb-af68-47d6-8475-6a8634cff312")))
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
