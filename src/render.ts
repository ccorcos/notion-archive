import {
	BlockObjectResponse,
	EquationRichTextItemResponse,
	MentionRichTextItemResponse,
	PageObjectResponse,
	ParagraphBlockObjectResponse,
	RichTextItemResponse,
	TextRichTextItemResponse,
	UserObjectResponse,
} from "@notionhq/client/build/src/api-endpoints"
import { copyFile, mkdirpSync, writeFile } from "fs-extra"
import { Api, getBlockChildren } from "./api"
import { Cache } from "./Cache"
import { Crawler } from "./Crawler"
import { unreachable } from "./helpers/unreachable"
import { toUuid } from "./helpers/uuid"

function escapeHtml(text: string) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}

function parseColor(str: string) {
	let color: string | undefined
	let background: string | undefined
	if (str !== "default") {
		if (str.includes("background")) {
			background = str.split("_")[0]
		} else {
			color = str
		}
	}
	return { color, background }
}

type AnnotationResponse = TextRichTextItemResponse["annotations"]

function renderAnnotations(html: string, annotations: AnnotationResponse) {
	if (annotations.bold) html = `<strong>${html}</strong>`
	if (annotations.code) html = `<code>${html}</code>`
	if (annotations.italic) html = `<em>${html}</em>`
	if (annotations.strikethrough) html = `<s>${html}</s>`
	if (annotations.underline) html = `<u>${html}</u>`

	const { color, background } = parseColor(annotations.color)
	if (background) html = `<span style="background:${background}">${html}</span>`
	if (color) html = `<span style="color:${color}">${html}</span>`
	return html
}

function renderTextToken(token: TextRichTextItemResponse, plain = false) {
	let html = escapeHtml(token.plain_text)

	if (!plain) {
		html = renderAnnotations(html, token.annotations)
		if (token.href) html = `<a href="${token.href}">${html}</a>`
	}

	return html
}

function renderEquationToken(token: EquationRichTextItemResponse) {
	// TODO: render KaTeX
	let html = escapeHtml(token.equation.expression)

	html = renderAnnotations(html, token.annotations)
	if (token.href) html = `<a href="${token.href}">${html}</a>`

	return html
}

type DateResponse = Extract<
	MentionRichTextItemResponse["mention"],
	{ type: "date" }
>["date"]

const amPm = "en-US"
const miltaryTime = "en-GB"
const locale = amPm

function formatDate(str: string) {
	return new Date(str).toLocaleDateString(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

function formatDateTime(str: string, timeZone?: string | undefined) {
	const d = new Date(str)
	const date = d.toLocaleDateString(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: timeZone,
	})
	const time = d.toLocaleTimeString(locale, {
		hour: "numeric",
		minute: "numeric",
		timeZone: timeZone,
	})
	return `${date} ${time}`
}

function formatDateResponse(date: DateResponse) {
	if (date.start.length === "MMMM-MM-DD".length) {
		let str = formatDate(date.start)
		if (date.end) {
			const end = formatDate(date.end)
			str += ` → ${end}`
		}
		return str
	} else {
		const timeZone = date.time_zone || undefined
		let str = formatDateTime(date.start, timeZone)
		if (date.end) {
			const end = formatDateTime(date.end, timeZone)
			str += ` → ${end}`
		}
		if (timeZone) {
			str += ` (${timeZone})`
		}
		return str
	}
}

function renderMentionToken(token: MentionRichTextItemResponse, plain = false) {
	if (token.mention.type === "date") {
		const text = formatDateResponse(token.mention.date)
		if (plain) return text
		return `<time>${text}</time>`
	}

	if (token.mention.type === "database") {
		const text = escapeHtml(token.plain_text)
		if (plain) return text
		const url = token.mention.database.id + ".html"
		return `<a class="page-mention" href="${url}">${text}</a>`
	}

	if (token.mention.type === "page") {
		const text = escapeHtml(token.plain_text)
		if (plain) return text
		const url = token.mention.page.id + ".html"
		return `<a class="page-mention" href="${url}">${text}</a>`
	}

	if (token.mention.type === "link_preview") {
		const text = escapeHtml(token.plain_text)
		if (plain) return text
		const url = token.mention.link_preview.url
		return `<a href="${url}">${text}</a>`
	}

	if (token.mention.type === "template_mention") {
		if (token.mention.template_mention.type === "template_mention_date") {
			const date = token.mention.template_mention.template_mention_date
			const text = `{{${date}}}`
			if (plain) return text
			return `<span>${text}</span>`
		} else {
			const user = token.mention.template_mention.template_mention_user
			const text = `{{${user}}}`
			if (plain) return text
			return `<span>${text}</span>`
		}
	}
	if (token.mention.type === "user") {
		const text = escapeHtml(token.plain_text)
		if (plain) return text
		const id = token.mention.user.id
		return `<span class="user-mention" data-id="${id}">${text}</span>`
	}

	unreachable(token.mention)
}

function renderRichText(text: RichTextItemResponse[], plain = false) {
	const strings = text.map((token) => {
		if (token.type === "text") return renderTextToken(token, plain)
		if (token.type === "equation") return renderEquationToken(token)
		if (token.type === "mention") return renderMentionToken(token, plain)
		unreachable(token)
	})
	return strings.join("")
}

function captioned(caption: RichTextItemResponse[], html: string) {
	if (caption.length === 0) return html
	const text = renderRichText(caption)
	return `<figure>${html}<figcaption>${text}</figcaption></figure>`
}

type ApiColor = ParagraphBlockObjectResponse["paragraph"]["color"]

function colored(tag: string, colorStr: ApiColor, content: string) {
	const { color, background } = parseColor(colorStr)
	if (background)
		return `<${tag} style="background:${background}">${content}</${tag}>`
	if (color) return `<${tag} style="color:${color}">${content}</${tag}>`
	return `<${tag}>${content}</${tag}>`
}

async function renderBlock(api: Api, block: BlockObjectResponse) {
	switch (block.type) {
		case "paragraph": {
			const { rich_text, color } = block.paragraph
			return (
				colored("p", color, renderRichText(rich_text)) +
				childrenDiv(await renderBlockChildren(api, block))
			)
		}
		case "heading_1": {
			// Page title is h1 so we de-rank blocks.
			const { rich_text, color } = block.heading_1
			return (
				colored("h2", color, renderRichText(rich_text)) +
				childrenDiv(await renderBlockChildren(api, block))
			)
		}
		case "heading_2": {
			const { rich_text, color } = block.heading_2
			return (
				colored("h3", color, renderRichText(rich_text)) +
				childrenDiv(await renderBlockChildren(api, block))
			)
		}
		case "heading_3": {
			const { rich_text, color } = block.heading_3
			return (
				colored("h4", color, renderRichText(rich_text)) +
				childrenDiv(await renderBlockChildren(api, block))
			)
		}
		case "quote": {
			const { rich_text, color } = block.quote
			return colored(
				"blockquote",
				color,
				renderRichText(rich_text) + (await renderBlockChildren(api, block))
			)
		}

		case "toggle": {
			const { rich_text, color } = block.toggle
			return colored(
				"details",
				color,
				`<summary>${renderRichText(rich_text)}</summary>` +
					(await renderBlockChildren(api, block))
			)
		}

		case "callout": {
			const { rich_text, color, icon } = block.callout
			// TODO: handle icon
			return colored(
				"aside",
				color,
				`<p>${renderRichText(rich_text)}</p>` +
					(await renderBlockChildren(api, block))
			)
		}

		case "code": {
			const { rich_text, language, caption } = block.code
			const text = renderRichText(rich_text)
			// TODO: display language somewhere?
			// TODO: load prism to syntax highlight.
			let html = `<pre><code class="lang-${language}">${text}</code></pre>`
			html = captioned(caption, html)
			return html
		}

		case "bulleted_list_item": {
			const { rich_text, color } = block.bulleted_list_item
			const children = await renderBlockChildren(api, block)
			const title = renderRichText(rich_text)
			const text = children ? `<p>${title}</p>${children}` : title
			return colored("li", color, text)
		}

		case "numbered_list_item": {
			const { rich_text, color } = block.numbered_list_item
			const children = await renderBlockChildren(api, block)
			const title = renderRichText(rich_text)
			const text = children ? `<p>${title}</p>${children}` : title
			return colored("li", color, text)
		}

		case "to_do": {
			const { rich_text, color, checked } = block.to_do
			const children = await renderBlockChildren(api, block)
			const value = checked ? " checked" : ""
			const checkbox = `<input type="checkbox"${value}/>`
			const title = checkbox + renderRichText(rich_text)
			const text = children ? `<p>${title}</p>${children}` : title
			return colored("li", color, text)
		}

		case "link_preview": {
			const { url } = block.link_preview
			return `<a class="preview" href=${url}>${url}</a>`
		}

		case "bookmark": {
			const { url, caption } = block.bookmark
			let html = `<a class="bookmark" href=${url}>${url}</a>`
			html = captioned(caption, html)
			return html
		}

		case "equation": {
			// TODO: render KaTeX
			const text = block.equation.expression
			return `<pre class="katex">${escapeHtml(text)}</pre>`
		}

		case "file": {
			// TODO: download file. And icons...
			const url =
				block.file.type === "file"
					? block.file.file.url
					: block.file.external.url
			const caption = block.file.caption
			return captioned(caption, `<a class="file" href="${url}">${url}</a>`)
		}

		case "pdf": {
			const url =
				block.pdf.type === "file" ? block.pdf.file.url : block.pdf.external.url
			const caption = block.pdf.caption
			return captioned(caption, `<a class="pdf" href="${url}">${url}</a>`)
		}

		case "image": {
			// TODO: download file. And icons...
			const url =
				block.image.type === "file"
					? block.image.file.url
					: block.image.external.url
			const caption = block.image.caption
			return captioned(caption, `<img src="${url}"/>`)
		}

		case "embed": {
			const { url, caption } = block.embed
			return captioned(caption, `<iframe src="${url}"></iframe>`)
		}

		case "audio": {
			// TODO: download file. And icons...
			const url =
				block.audio.type === "file"
					? block.audio.file.url
					: block.audio.external.url
			const caption = block.audio.caption
			return captioned(caption, `<audio controls><source src="${url}"></audio>`)
		}

		case "video": {
			// TODO: download file. And icons...
			const url =
				block.video.type === "file"
					? block.video.file.url
					: block.video.external.url
			const caption = block.video.caption
			return captioned(caption, `<video controls><source src="${url}"></video>`)
		}

		case "divider": {
			return `<hr/>`
		}

		case "table": {
			const { has_column_header, has_row_header, table_width } = block.table
			const children = (await getBlockChildren(block.id)) || []
			const rows = children.map((child, row) => {
				if (child.type !== "table_row")
					return console.warn("Table child is not a table row:", block.id)

				const data = child.table_row.cells.map((cell, col) => {
					const header =
						(has_column_header && row === 0) || (has_row_header && col === 0)
					const tag = header ? "th" : "td"
					return `<${tag}>${renderRichText(cell)}</${tag}>`
				})
				return `<tr>${data}</tr>`
			})
			return `<table>${rows}</table>`
		}

		case "table_row": {
			console.warn("Table row only be rendered inside a table", block.id)
			return ""
		}

		case "link_to_page": {
			if (block.link_to_page.type === "database_id") {
				// TODO: name?
				const id = block.link_to_page.database_id + ".html"
				return `<p><a class="page-mention" href="${id}">${id}</a></p>`
			}
			if (block.link_to_page.type === "page_id") {
				// TODO: name?
				const id = block.link_to_page.page_id + ".html"
				return `<p><a class="page-mention" href="${id}">${id}</a></p>`
			}
			return ""
		}

		case "child_page": {
			const url = block.id + ".html"
			const title = escapeHtml(block.child_page.title)
			return `<p><a class="page-mention" href="${url}">${title}</a></p>`
		}

		case "child_database": {
			// TODO: display database inline?
			const url = block.id + ".html"
			const title = escapeHtml(block.child_database.title)
			return `<p><a class="page-mention" href="${url}">${title}</a></p>`
		}

		// Ignore blocks.
		case "table_of_contents":
		case "breadcrumb":
		case "synced_block":
		case "column":
		case "column_list":
		case "template":
		case "unsupported":
			return ""
	}
}

async function renderBlockChildren(
	api: Api,
	block: { id: string; has_children: boolean }
): Promise<string> {
	if (block.has_children) {
		const children = await getBlockChildren(block.id)
		if (!children) throw new Error("Missing page children: " + block.id)

		let html = ""
		let list: "bulleted_list_item" | "numbered_list_item" | "to_do" | undefined

		const renderedChildren = await Promise.all(
			children.map(
				async (child) => [child, await renderBlock(api, child)] as const
			)
		)

		for (const [child, rendered] of renderedChildren) {
			// Close list.
			if (list !== undefined && list !== child.type) {
				if (list === "to_do") html += "</ul>"
				if (list === "bulleted_list_item") html += "</ul>"
				if (list === "numbered_list_item") html += "</ol>"
				list = undefined
			}

			// Open list.
			if (list === undefined) {
				if (child.type === "to_do") {
					html += "<ul>"
					list = child.type
				}
				if (child.type === "bulleted_list_item") {
					html += "<ul>"
					list = child.type
				}
				if (child.type === "numbered_list_item") {
					html += "<ol>"
					list = child.type
				}
			}
			html += rendered
		}

		// Close final list.
		if (list !== undefined) {
			if (list === "to_do") html += "</ul>"
			if (list === "bulleted_list_item") html += "</ul>"
			if (list === "numbered_list_item") html += "</ol>"
			list = undefined
		}

		return html
	}

	return ""
}

function childrenDiv(html: string) {
	if (html) {
		return `<div class="children">${html}</div>`
	}
	return html
}

async function renderPage(api: Api, id: string) {
	const page = await api.getPage(id)
	if (!page) throw new Error("Missing page: " + id)

	// page.icon
	// page.cover
	// page.last_edited_time

	let title = ""
	const property = Object.values(page.properties).find(
		(prop) => prop.type === "title"
	)
	if (property && property.type === "title") {
		title = renderRichText(property.title)
	} else {
		console.warn("Page missing title: ", id)
	}

	return (
		`<h1>${title}</h1>` +
		(await renderBlockChildren(api, { id: page.id, has_children: true }))
	)
}

type Property = PageObjectResponse["properties"][string]

function renderProperty(value: Property, pageId: string): string {
	switch (value.type) {
		case "checkbox":
		case "number":
			if (value[value.type] === null) return ""
			return value[value.type].toString()

		case "phone_number":
			if (value.phone_number === null) return ""
			const phone = value.phone_number
			const numbers = phone.replace(/[^0-9]/g, "")
			return `<a href="tel:${numbers}">${phone}</a>`

		case "url":
			if (value.url === null) return ""
			const url = value.url
			return `<a href="${url}">${url}</a>`

		case "email":
			if (value.email === null) return ""
			const email = value.email
			return `<a href="mailto:${email}">${email}</a>`

		case "rich_text":
			return renderRichText(value.rich_text)

		case "title":
			const text = renderRichText(value.title, true)
			const pageUrl = pageId + ".html"
			return `<a href="${pageUrl}">${text}</a>`

		case "date":
			if (value.date === null) return ""
			return formatDateResponse(value.date)

		case "last_edited_time":
		case "created_time":
			return formatDateTime(value[value.type])

		case "multi_select":
			return value.multi_select
				.map((item) => {
					return `<span class="token" style="background:${item.color}">${item.name}</span>`
				})
				.join(", ")

		case "select":
		case "status":
			const item = value[value.type]
			if (!item) return ""
			return `<span class="token" style="background:${item.color}">${item.name}</span>`

		case "last_edited_by":
		case "created_by":
			return (value[value.type] as UserObjectResponse)?.name || ""

		case "people":
			return value.people
				.map((person) => (person as UserObjectResponse)?.name || "")
				.join(", ")

		case "files": {
			return value.files
				.map((file) => {
					if (file.type === "external") {
						const url = file.external.url
						return `<a href=${url}>${file.name}</a>`
					} else if (file.type === "file") {
						const url = file.file.url
						return `<a href=${url}>${file.name}</a>`
					}
				})
				.filter(Boolean)
				.join(", ")
		}

		case "relation":
			return value.relation
				.map((relation) => {
					// TODO: page title?
					const url = relation.id
					return `<a href=${url}>${url}</a>`
				})
				.join(", ")

		case "formula": {
			const formula = value.formula
			if (formula.type === "boolean") {
				return Boolean(formula.boolean).toString()
			} else if (formula.type === "date") {
				if (formula.date === null) return ""
				return formatDateResponse(formula.date)
			} else if (formula.type === "number") {
				if (formula.number === null) return ""
				return formula.number.toString()
			} else if (formula.type === "string") {
				return formula.string || ""
			} else {
				unreachable(formula)
			}
		}

		case "rollup":
			if (value.rollup.type === "date") {
				if (value.rollup.date === null) return ""
				return formatDateResponse(value.rollup.date)
			} else if (value.rollup.type === "number") {
				if (value.rollup.number === null) return ""
				return value.rollup.number.toString()
			} else if (value.rollup.type === "array") {
				// TODO: fix types here so we don't have to cast to any.
				return value.rollup.array
					.map((item) => renderProperty(item as any, pageId))
					.join(", ")
			} else {
				unreachable(value.rollup)
			}
		default:
			unreachable(value)
	}
}

async function renderDatabase(api: Api, id: string) {
	const database = await api.getDatabase(id)
	if (!database) throw new Error("Missing database: " + id)

	const children = await api.getDatabaseChildren(id)
	if (!children) throw new Error("Missing database children: " + id)

	const title = renderRichText(database.title)

	const props = Object.values(database.properties)

	const row1 = props.map((prop) => `<th>${prop.name}</th>`).join("")

	const rows = children
		.map((child) => {
			const data = props
				.map((prop) => {
					const value = child.properties[prop.name]
					if (!value) return `<td></td>`
					return `<td>${renderProperty(value, child.id)}</td>`
				})
				.join("")
			return `<tr>${data}</tr>`
		})
		.join("")

	const table = `<table>${row1}${rows}</table>`

	return `<h1>${title}</h1>` + table
}

const rootPageId = toUuid("0e27612403084b2fb4a3166edafd623a")

async function main() {
	const cache = new Cache("data/cache2.db")
	const api = cache.api

	// Crawl and collect all the pages.
	const pages: string[] = []
	const databases: string[] = []
	const crawler = new Crawler(api, (obj) => {
		if (obj.object === "page") pages.push(obj.id)
		if (obj.object === "database") databases.push(obj.id)
	})
	await crawler.crawlPage(rootPageId)

	// Render pages.
	mkdirpSync(__dirname + "/../rendered")

	const write = async (id: string, html: string) => {
		html = [
			"<head>",
			`<meta charset="UTF-8">`,
			`<link rel="stylesheet" href="styles.css">`,
			"</head>",
			html,
		].join("")

		await writeFile(__dirname + "/../rendered/" + id + ".html", html)
		console.log("Rendered:", id)
	}

	// Copy CSS over.
	await copyFile(
		__dirname + "/styles.css",
		__dirname + "/../rendered/styles.css"
	)

	await Promise.all([
		...pages.map(async (pageId) => {
			const html = await renderPage(api, pageId)
			await write(pageId, html)
		}),
		...databases.map(async (databaseId) => {
			const html = await renderDatabase(api, databaseId)
			await write(databaseId, html)
		}),
	])
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
