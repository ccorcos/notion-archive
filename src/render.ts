import { Cache } from "./Cache"
import { uuid } from "./uuid"

const rootPageId = uuid("0e27612403084b2fb4a3166edafd623a")

async function main() {
	const cache = new Cache("data/cache.db", true)

	const block = cache.getBlock(rootPageId)!
	if (block.type === "child_page") {
		block.child_page.title
	}

	// console.log(block.child_page)
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
