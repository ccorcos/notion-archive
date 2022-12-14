import { Cache } from "./Cache"
import { toUuid } from "./helpers/uuid"

async function main() {
	const cache = new Cache("data/cache2.db")
	console.log(
		JSON.stringify(
			await cache.api.getDatabase(
				toUuid("9bf830ed-daff-4ca1-8a8b-ef7b6b105cd8")
			),
			null,
			2
		)
	)
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
