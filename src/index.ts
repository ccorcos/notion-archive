import { Client as NotionClient } from "@notionhq/client"
import {
	BlockObjectResponse,
	DatabaseObjectResponse,
} from "@notionhq/client/build/src/api-endpoints"
import { readFileSync } from "fs"

// TODO LATER:
// - child pages
// - child page mentions with [[wiki]] syntax.

const token = readFileSync(__dirname + "/../token.txt", "utf8")
const rootPageId = "0e27612403084b2fb4a3166edafd623a"
const notion = new NotionClient({ auth: token })

type Pointer = { type: "block"; id: string } | { type: "database"; id: string }

const state = {
	queue: [{ type: "block", id: rootPageId }] as Pointer[],
	objects: {} as {
		[id: string]: BlockObjectResponse | DatabaseObjectResponse
	},
	children: {} as { [id: string]: string[] },
}

async function fetchBlock(blockId: string) {
	console.log("block:", blockId)
	const block = await notion.blocks.retrieve({ block_id: blockId })
	handleBlock(block as BlockObjectResponse)
}

async function handleBlock(block: BlockObjectResponse) {
	// The child block and the database have the same object id so we want to make sure
	// to save the database object and not the block object.
	if (block.type === "child_database") {
		if (!(block.id in state.objects) || !(block.id in state.children))
			state.queue.push({ type: "database", id: block.id })
		return
	}

	if (!(block.id in state.objects)) {
		state.objects[block.id] = block
	}

	if (block.has_children && !(block.id in state.children)) {
		state.queue.push({ type: "block", id: block.id })
	}
}

async function fetchDatabase(databaseId: string) {
	console.log("database:", databaseId)
	const database = await notion.databases.retrieve({ database_id: databaseId })
	handleDatabase(database as DatabaseObjectResponse)
}

async function handleDatabase(database: DatabaseObjectResponse) {
	if (!(database.id in state.objects)) {
		state.objects[database.id] = database
	}
	if (!(database.id in state.children)) {
		state.queue.push({ type: "database", id: database.id })
	}
}

// "child_page";
// "child_database";
//
// "page";
// "database";
// "page_or_database";
//
// "paragraph";
// "heading_1";
// "heading_2";
// "heading_3";
// "bulleted_list_item";
// "numbered_list_item";
// "quote";
// "to_do";
// "toggle";
// "template";
// "synced_block";
// "equation";
// "code";
// "callout";
// "divider";
// "breadcrumb";
// "table_of_contents";
// "column_list";
// "column";
// "link_to_page";
// "table";
// "table_row";
// "embed";
// "bookmark";
// "image";
// "video";
// "pdf";
// "file";
// "audio";
// "link_preview";
// "unsupported";
// "number";

async function fetchBlockChildren(blockId: string) {
	console.log("block children:", blockId)
	type Cursor = Parameters<typeof notion.blocks.children.list>[0]
	const cursor: Cursor = { block_id: blockId }

	const children: string[] = []
	while (true) {
		const result = await notion.blocks.children.list(cursor)

		for (const child of result.results as BlockObjectResponse[]) {
			children.push(child.id)
			handleBlock(child)
		}

		if (result.has_more && result.next_cursor) {
			cursor.start_cursor = result.next_cursor
		} else {
			break
		}
	}

	state.children[blockId] = children
}

function enqueue(pointer: Pointer) {
	state.queue.push(pointer)
}

function queueIsNotEmpty() {
	return state.queue.length > 0
}

function dequeue() {
	console.log("queue:", state.queue.length)
	return state.queue.pop()!
}

function objectHasBeenFetched(id: string) {
	return id in state.objects
}

function saveObject(obj: BlockObjectResponse | DatabaseObjectResponse) {
	state.objects[obj.id] = obj
}

function childrenHaveBeenFetched(id: string) {
	return id in state.children
}

async function main2() {
	while (queueIsNotEmpty()) {
		const pointer = dequeue()

		if (pointer.type === "block") {
			if (!objectHasBeenFetched(pointer.id)) {
				const response = await notion.blocks.retrieve({ block_id: pointer.id })
				const block = response as BlockObjectResponse

				if (block.type === "child_database") {
					enqueue({ type: "database", id: block.id })
				} else {
					saveObject(block as BlockObjectResponse)
				}
			}

			if (!childrenHaveBeenFetched(pointer.id)) {
				fetchBlockChildren(pointer.id)
			}
		}
	}

	console.log(JSON.stringify(state, null, 2))
}

async function main() {
	const databaseId = "9bf830eddaff4ca18a8bef7b6b105cd8"
	console.log(await notion.blocks.children.list({ block_id: rootPageId }))
	console.log(await notion.databases.retrieve({ database_id: databaseId }))
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
