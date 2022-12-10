// import BetterSqlite3 from "better-sqlite3"
// import { mkdirpSync } from "fs-extra"
// import * as path from "path"

// export class Storage {
// 	private db: BetterSqlite3.Database

// 	constructor(dbPath: string) {
// 		mkdirpSync(path.parse(dbPath).dir)
// 		this.db = new BetterSqlite3(dbPath)
// 		this.db
// 			.prepare(
// 				`
// 				create table if not exists notion (
// 					tabl text,
// 					id text,
// 					data text,
// 					primary key (tabl, id),
// 					unique (table, id)
// 				)
// 				`.trim()
// 			)
// 			.run()

// 		const insertRow = this.db.prepare(
// 			"insert or replace into notion (tabl, id, data) values ($table, $id, $data)"
// 		)
// 		const insertRows = this.db.transaction((args) => {
// 			for (const arg of args) {
// 				insertRow.run(arg)
// 			}
// 		})

// 		this.batch = new BatchQueue(async (args) => {
// 			insertRows(args)
// 			return []
// 		}, 0) as any

// 		this.getQuery = this.db.prepare(
// 			`select data from notion where tabl=$table and id=$id`
// 		)

// 		// Download state
// 		this.db
// 			.prepare(
// 				`
// 			create table if not exists download_state (
// 				key text,
// 				done int,
// 				pending int,
// 				primary key (key),
// 				unique (key)
// 			)
// 			`.trim()
// 			)
// 			.run()

// 		this.db
// 			.prepare(
// 				`
// 			create index if not exists download_state_done on download_state (
// 				done,
// 				pending,
// 				key
// 			)
// 			`.trim()
// 			)
// 			.run()

// 		this.dequeueQuery = this.db.prepare(
// 			`select key from download_state where done = 0 and pending = 0 limit 100`
// 		)
// 		const pendingQuery = this.db.prepare(
// 			`update download_state set pending = 1 where key = $key`
// 		)
// 		this.makePending = this.db.transaction((objs) => {
// 			for (const { key } of objs) {
// 				pendingQuery.run({ key })
// 			}
// 		})
// 		this.hasQuery = this.db.prepare(
// 			`select done from download_state where key = $key`
// 		)
// 		this.addQuery = this.db.prepare(
// 			`insert or ignore into download_state (key, done, pending) values ($key, 0, 0)`
// 		)
// 		this.doneQuery = this.db.prepare(
// 			`update download_state set done = 1 where key = $key`
// 		)
// 	}

// 	private getQuery: BetterSqlite3.Statement<any>
// 	private dequeueQuery: BetterSqlite3.Statement<any>
// 	private makePending: BetterSqlite3.Transaction
// 	private hasQuery: BetterSqlite3.Statement<any>
// 	private addQuery: BetterSqlite3.Statement<any>
// 	private doneQuery: BetterSqlite3.Statement<any>

// 	public has(args: { table: string; id: string }) {
// 		const result = this.hasQuery.get({ key: args.table + ":" + args.id })
// 		return Boolean(result)
// 	}
// 	public add(args: { table: string; id: string }) {
// 		this.addQuery.run({ key: args.table + ":" + args.id })
// 	}
// 	public done(args: { table: string; id: string }) {
// 		this.doneQuery.run({ key: args.table + ":" + args.id })
// 	}
// 	public dequeue() {
// 		const result = this.dequeueQuery.all({})
// 		if (result.length === 0) {
// 			return []
// 		}
// 		this.makePending(result)

// 		return result.map(({ key }) => {
// 			const [table, id] = key.split(":")
// 			return { table, id } as RecordPointer
// 		})
// 	}

// 	public retryPending() {
// 		let count = 0
// 		while (true) {
// 			const objs = this.db
// 				.prepare(
// 					`select key from download_state where done = 0 and pending = 1 limit 1000`
// 				)
// 				.all()
// 			if (objs.length === 0) {
// 				return count
// 			}
// 			count += objs.length
// 			const retryQuery = this.db.prepare(
// 				`update download_state set pending = 0 where key = $key`
// 			)
// 			for (const { key } of objs) {
// 				retryQuery.run({ key })
// 			}
// 		}
// 	}

// 	public saveRecord(table: string, id: string, data: Schema[keyof Schema]) {
// 		// Log every 1000 so we can spot-check.
// 		if (Math.random() < 0.001) {
// 			console.log("SAVE", table, id)
// 		}
// 		if ("role" in data) {
// 			throw new Error("HERE: " + table + id)
// 		}
// 		this.batch.enqueue({ table, id, data: JSON.stringify(data) })
// 	}

// 	public getRecord<T extends keyof Schema>(
// 		table: T,
// 		id: string
// 	): Schema[T] | undefined {
// 		const result = this.getQuery.get({ table, id })
// 		if (!result) {
// 			console.log("Missing")
// 			return
// 		}
// 		return JSON.parse(result.data)
// 	}
// }

// /*

// // Testing download state.

// const db = new Storage("./test.db")
// if (db.has({ table: "a", id: "b" }) !== false) {
// 	throw new Error("1")
// }
// db.add({ table: "a", id: "b" })
// if (db.has({ table: "a", id: "b" }) !== true) {
// 	throw new Error("2")
// }
// db.add({ table: "a", id: "c" })
// if (db.has({ table: "a", id: "c" }) !== true) {
// 	throw new Error("3")
// }

// const items = db.dequeue()
// console.log("items3", items)

// db.done({ table: "a", id: "c" })
// if (db.has({ table: "a", id: "c" }) !== true) {
// 	throw new Error("4")
// }

// const items2 = db.dequeue()
// console.log("items2", items2)

// db.add({ table: "a", id: "c" })
// if (db.has({ table: "a", id: "c" }) !== true) {
// 	throw new Error("5")
// }
// const items22 = db.dequeue()
// console.log("items22", items22)

// */
