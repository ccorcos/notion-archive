import { Client as NotionClient } from "@notionhq/client"
import {
	BlockObjectResponse,
	DatabaseObjectResponse,
	PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints"
import { readFileSync } from "fs"

const token = readFileSync(__dirname + "/../token.txt", "utf8")
const notion = new NotionClient({ auth: token })

export type Api = {
	getPage: (id: string) => Promise<PageObjectResponse | undefined>
	getBlock: (id: string) => Promise<BlockObjectResponse | undefined>
	getDatabase: (id: string) => Promise<DatabaseObjectResponse | undefined>
	getBlockChildren: (id: string) => Promise<BlockObjectResponse[] | undefined>
	getDatabaseChildren: (id: string) => Promise<PageObjectResponse[] | undefined>
}

export async function getPage(id: string) {
	const response = await notion.pages.retrieve({ page_id: id })
	const page = response as PageObjectResponse
	return page
}

export async function getBlock(id: string) {
	const response = await notion.blocks.retrieve({ block_id: id })
	const block = response as BlockObjectResponse
	return block
}

export async function getDatabase(id: string) {
	const response = await notion.databases.retrieve({ database_id: id })
	const database = response as DatabaseObjectResponse
	return database
}

export async function getBlockChildren(id: string) {
	type Cursor = Parameters<typeof notion.blocks.children.list>[0]
	const cursor: Cursor = { block_id: id }

	const children: BlockObjectResponse[] = []
	while (true) {
		const response = await notion.blocks.children.list(cursor)
		const blocks = response.results as BlockObjectResponse[]
		children.push(...blocks)
		if (response.has_more && response.next_cursor) {
			cursor.start_cursor = response.next_cursor
		} else {
			break
		}
	}

	return children
}

export async function getDatabaseChildren(id: string) {
	type Cursor = Parameters<typeof notion.databases.query>[0]
	const cursor: Cursor = {
		database_id: id,
		sorts: [{ timestamp: "created_time", direction: "descending" }],
	}

	const children: PageObjectResponse[] = []
	while (true) {
		const response = await notion.databases.query(cursor)
		const pages = response.results as PageObjectResponse[]
		children.push(...pages)
		if (response.has_more && response.next_cursor) {
			cursor.start_cursor = response.next_cursor
		} else {
			break
		}
	}

	return children
}

export const api: Api = {
	getPage,
	getBlock,
	getDatabase,
	getBlockChildren,
	getDatabaseChildren,
}
