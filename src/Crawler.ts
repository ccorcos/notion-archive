import { CachedApi } from "./CachedApi"

function debug(...args: any[]) {
	console.log("CRAWL:", ...args)
}

/**
 * Uses the cache to crawl an entire subtree.
 */
export class Crawler {
	crawledBlock = new Set<string>()
	crawledBlockChildren = new Set<string>()
	crawledDatabase = new Set<string>()
	crawledDatabaseChildren = new Set<string>()

	constructor(public cache: CachedApi) {}

	async crawlBlock(id: string) {
		if (this.crawledBlock.has(id)) return

		debug("block", id)
		const block = await this.cache.getBlock(id)

		if (block.type === "child_database") {
			await this.crawlDatabase(id)
		} else {
			await this.crawlBlockChildren(id)
		}
	}

	async crawlBlockChildren(id: string) {
		if (this.crawledBlockChildren.has(id)) return

		debug("blockChildren", id)
		const children = await this.cache.getBlockChildren(id)
		for (const child of children) {
			await this.crawlBlock(child.id)
		}
	}

	async crawlDatabase(id: string) {
		if (this.crawledBlock.has(id)) return

		debug("database", id)
		await this.cache.getDatabase(id)
		await this.crawlDatabaseChildren(id)
	}

	async crawlDatabaseChildren(id: string) {
		if (this.crawledDatabaseChildren.has(id)) return

		debug("databaseChildren", id)
		const children = await this.cache.getDatabaseChildren(id)
		for (const child of children) {
			this.crawlBlock(child.id)
		}
	}
}
