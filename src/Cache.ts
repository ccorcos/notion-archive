import {
	BlockObjectResponse,
	DatabaseObjectResponse,
	PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints"
import BetterSqlite3 from "better-sqlite3"
import * as fs from "fs-extra"
import * as path from "path"
import { Api } from "./api"

function debug(...args: any[]) {
	// console.log("CACHE:", ...args)
}

type Caches = {
	page: PageObjectResponse
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
				if (result.length === 0) return debug("miss", name, id)
				if (result.length > 1) throw new Error(">1")
				debug("hit", name, id)
				return JSON.parse(result[0].data) as Caches[T]
			},
			set: (id: string, obj: Caches[T]) => {
				debug("save", name, id)
				this.setQuery.run({ name, id, data: JSON.stringify(obj) })
			},
		}
	}

	getPage(id: string) {
		const cached = this.cached("page").get(id)
		if (cached) return cached
	}

	setPage(page: PageObjectResponse) {
		this.cached("page").set(page.id, page)
	}

	getBlock(id: string) {
		const cached = this.cached("block").get(id)
		if (cached) return cached
	}

	setBlock(block: BlockObjectResponse) {
		this.cached("block").set(block.id, block)
	}

	getDatabase(id: string) {
		const cached = this.cached("database").get(id)
		if (cached) return cached
	}

	setDatabase(database: DatabaseObjectResponse) {
		this.cached("database").set(database.id, database)
	}

	getBlockChildren(id: string) {
		const cached = this.cached("blockChildren").get(id)
		if (cached) return cached
	}

	setBlockChildren(id: string, children: BlockObjectResponse[]) {
		this.cached("blockChildren").set(id, children)
	}

	getDatabaseChildren(id: string) {
		const cached = this.cached("databaseChildren").get(id)
		if (cached) return cached
	}

	setDatabaseChildren(id: string, children: PageObjectResponse[]) {
		this.cached("databaseChildren").set(id, children)
	}

	api: Api = {
		getPage: async (...args) => this.getPage(...args),
		getBlock: async (...args) => this.getBlock(...args),
		getBlockChildren: async (...args) => this.getBlockChildren(...args),
		getDatabase: async (...args) => this.getDatabase(...args),
		getDatabaseChildren: async (...args) => this.getDatabaseChildren(...args),
	}
}
