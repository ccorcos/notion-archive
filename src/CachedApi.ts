import { api, Api } from "./api"
import { Cache } from "./Cache"

/**
 * Simple wrapper around the API with a caching layer.
 */
export class CachedApi implements Api {
	constructor(private cache: Cache) {}

	missing(message: string) {
		// This is an issue because it means it won't get cached.
		console.warn("Missing " + message)
	}

	async getBlock(id: string) {
		const cached = this.cache.getBlock(id)
		if (cached) return cached

		const block = await api.getBlock(id)
		if (!block) {
			this.missing("block: " + id)
			return
		}

		this.cache.setBlock(block)
		return block
	}

	async getDatabase(id: string) {
		const cached = this.cache.getDatabase(id)
		if (cached) return cached

		const database = await api.getDatabase(id)
		if (!database) {
			this.missing("database: " + id)
			return
		}

		this.cache.setDatabase(database)
		return database
	}

	async getBlockChildren(id: string) {
		const cached = this.cache.getBlockChildren(id)
		if (cached) return cached

		const children = await api.getBlockChildren(id)
		if (!children) {
			this.missing("blockChildren: " + id)
			return
		}

		this.cache.setBlockChildren(id, children)
		return children
	}

	async getDatabaseChildren(id: string) {
		const cached = this.cache.getDatabaseChildren(id)
		if (cached) return cached

		const children = await api.getDatabaseChildren(id)
		if (!children) {
			this.missing("databaseChildren: " + id)
			return
		}

		this.cache.setDatabaseChildren(id, children)
		return children
	}
}
