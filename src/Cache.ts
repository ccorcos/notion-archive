import {
	BlockObjectResponse,
	DatabaseObjectResponse,
	PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints"
import * as api from "./api"

/**
 * Simple wrapper around the API with a caching layer.
 */
export class Cache {
	block = {} as { [id: string]: BlockObjectResponse }
	database = {} as { [id: string]: DatabaseObjectResponse }
	blockChildren = {} as { [id: string]: BlockObjectResponse[] }
	databaseChildren = {} as { [id: string]: PageObjectResponse[] }

	async getBlock(id: string) {
		const cached = this.block[id]
		if (cached) return cached

		const block = await api.getBlock(id)
		this.block[block.id] = block
		return block
	}

	async getDatabase(id: string) {
		const cached = this.database[id]
		if (cached) return cached

		const database = await api.getDatabase(id)
		this.database[database.id] = database
		return database
	}

	async getBlockChildren(id: string) {
		const cached = this.blockChildren[id]
		if (cached) return cached

		const children = await api.getBlockChildren(id)
		this.blockChildren[id] = children
		return children
	}

	async getDatabaseChildren(id: string) {
		const cached = this.databaseChildren[id]
		if (cached) return cached

		const children = await api.getDatabaseChildren(id)
		this.databaseChildren[id] = children
		return children
	}
}
