import * as api from "./api"

import {
	BlockObjectResponse,
	DatabaseObjectResponse,
	PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints"
import BetterSqlite3 from "better-sqlite3"
import * as fs from "fs-extra"
import * as path from "path"

function debug(...args: any[]) {
	console.log("CACHE:", ...args)
}

type Caches = {
	block: BlockObjectResponse
	database: DatabaseObjectResponse
	blockChildren: BlockObjectResponse[]
	databaseChildren: PageObjectResponse[]
}

/**
 * Simple wrapper around the API with a caching layer.
 */
export class Cache {
	private db: BetterSqlite3.Database

	private getQuery: BetterSqlite3.Statement
	private setQuery: BetterSqlite3.Statement

	constructor(dbPath: string) {
		fs.mkdirpSync(path.parse(dbPath).dir)
		this.db = new BetterSqlite3(dbPath)

		this.db
			.prepare(
				`create table if not exists cache (
					name text,
					id text,
					data text,
					primary key (name, id),
					unique (name, id)
				)`.trim()
			)
			.run()

		this.getQuery = this.db.prepare(
			`select data from cache where name = $name and id = $id`
		)
		this.setQuery = this.db.prepare(
			"insert or replace into cache (name, id, data) values ($name, $id, $data)"
		)
	}

	cached<T extends keyof Caches>(name: T) {
		return {
			get: (id: string) => {
				const result = this.getQuery.all({ name, id })
				debug("miss", id)
				if (result.length === 0) return
				if (result.length > 1) throw new Error(">1")
				debug("hit", id)
				return JSON.parse(result[0].data) as Caches[T]
			},
			set: (id: string, obj: Caches[T]) => {
				debug("save", id)
				this.setQuery.run({ name, id, data: JSON.stringify(obj) })
			},
		}
	}

	async getBlock(id: string) {
		const cached = this.cached("block").get(id)
		if (cached) return cached

		const block = await api.getBlock(id)
		this.cached("block").set(block.id, block)
		return block
	}

	async getDatabase(id: string) {
		const cached = this.cached("database").get(id)
		if (cached) return cached

		const database = await api.getDatabase(id)
		this.cached("database").set(database.id, database)
		return database
	}

	async getBlockChildren(id: string) {
		const cached = this.cached("blockChildren").get(id)
		if (cached) return cached

		const children = await api.getBlockChildren(id)
		this.cached("blockChildren").set(id, children)
		return children
	}

	async getDatabaseChildren(id: string) {
		const cached = this.cached("databaseChildren").get(id)
		if (cached) return cached

		const children = await api.getDatabaseChildren(id)
		this.cached("databaseChildren").set(id, children)
		return children
	}
}
