import { Cache } from "./Cache"
import { toUuid } from "./helpers/uuid"

async function main() {
	const cache = new Cache("data/cache.db")
	console.log(cache.api.getBlock(toUuid("0e27612403084b2fb4a3166edafd623a")))
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
