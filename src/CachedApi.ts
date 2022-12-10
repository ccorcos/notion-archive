import * as api from "./api"
import { Cache } from "./Cache"

/**
 * Simple wrapper around the API with a caching layer.
 */
export class CachedApi {
	constructor(private cache: Cache) {}

	async getBlock(id: string) {
		const cached = this.cache.getBlock(id)
		if (cached) return cached

		const block = await api.getBlock(id)
		this.cache.setBlock(block)
		return block
	}

	async getDatabase(id: string) {
		const cached = this.cache.getDatabase(id)
		if (cached) return cached

		const database = await api.getDatabase(id)
		this.cache.setDatabase(database)
		return database
	}

	async getBlockChildren(id: string) {
		const cached = this.cache.getBlockChildren(id)
		if (cached) return cached

		const children = await api.getBlockChildren(id)
		this.cache.setBlockChildren(id, children)
		return children
	}

	async getDatabaseChildren(id: string) {
		const cached = this.cache.getDatabaseChildren(id)
		if (cached) return cached

		const children = await api.getDatabaseChildren(id)
		this.cache.setDatabaseChildren(id, children)
		return children
	}
}
