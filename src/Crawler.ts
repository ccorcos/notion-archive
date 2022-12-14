import { Api } from "./api"

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

	constructor(public api: Api) {}

	async crawlBlock(id: string) {
		if (this.crawledBlock.has(id)) return

		debug("block", id)
		const block = await this.api.getBlock(id)
		if (!block) {
			console.warn("Missing block:", id)
			return
		}

		if (block.type === "child_database") {
			await this.crawlDatabase(id)
		} else {
			await this.crawlBlockChildren(id)
		}
	}

	async crawlBlockChildren(id: string) {
		if (this.crawledBlockChildren.has(id)) return

		debug("blockChildren", id)
		const children = await this.api.getBlockChildren(id)
		if (!children) {
			console.warn("Missing blockChildren:", id)
			return
		}
		for (const child of children) {
			await this.crawlBlock(child.id)
		}
	}

	async crawlDatabase(id: string) {
		if (this.crawledBlock.has(id)) return

		debug("database", id)
		const database = await this.api.getDatabase(id)
		if (!database) {
			console.warn("Missing database:", id)
			return
		}

		await this.crawlDatabaseChildren(id)
	}

	async crawlDatabaseChildren(id: string) {
		if (this.crawledDatabaseChildren.has(id)) return

		debug("databaseChildren", id)
		const children = await this.api.getDatabaseChildren(id)
		if (!children) {
			console.warn("Missing databaseChildren:", id)
			return
		}
		for (const child of children) {
			this.crawlBlock(child.id)
		}
	}
}
