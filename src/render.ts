import {
	BlockObjectResponse,
	EquationRichTextItemResponse,
	MentionRichTextItemResponse,
	ParagraphBlockObjectResponse,
	RichTextItemResponse,
	TextRichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints"
import { mkdirpSync, writeFileSync } from "fs-extra"
import { Api, getBlockChildren } from "./api"
import { Cache } from "./Cache"
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

function renderTextToken(token: TextRichTextItemResponse) {
	let html = escapeHtml(token.plain_text)

	html = renderAnnotations(html, token.annotations)
	if (token.href) html = `<a href="${token.href}">${html}</a>`

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

function formatDateTime(str: string, timeZone: string | undefined) {
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

function renderMentionToken(token: MentionRichTextItemResponse) {
	if (token.mention.type === "date")
		return `<time>${formatDateResponse(token.mention.date)}</time>`

	if (token.mention.type === "database") {
		const url = token.mention.database.id
		const text = escapeHtml(token.plain_text)
		return `<a class="page-mention" href="${url}">${text}</a>`
	}

	if (token.mention.type === "page") {
		const url = token.mention.page.id
		const text = escapeHtml(token.plain_text)
		return `<a class="page-mention" href="${url}">${text}</a>`
	}

	if (token.mention.type === "link_preview") {
		const text = escapeHtml(token.plain_text)
		const url = token.mention.link_preview.url
		return `<a href="${url}">${text}</a>`
	}

	if (token.mention.type === "template_mention") {
		if (token.mention.template_mention.type === "template_mention_date") {
			const text = token.mention.template_mention.template_mention_date
			return `<span>{{${text}}}</span>`
		} else {
			const text = token.mention.template_mention.template_mention_user
			return `<span>{{${text}}}</span>`
		}
	}
	if (token.mention.type === "user") {
		const text = escapeHtml(token.plain_text)
		const id = token.mention.user.id
		return `<span class="user-mention" data-id="${id}">${text}</span>`
	}

	unreachable(token.mention)
}

function renderRichText(text: RichTextItemResponse[]) {
	const strings = text.map((token) => {
		if (token.type === "text") return renderTextToken(token)
		if (token.type === "equation") return renderEquationToken(token)
		if (token.type === "mention") return renderMentionToken(token)
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
				const id = block.link_to_page.database_id
				return `<p><a class="page-mention" href="${id}">${id}</a></p>`
			}
			if (block.link_to_page.type === "page_id") {
				// TODO: name?
				const id = block.link_to_page.page_id
				return `<p><a class="page-mention" href="${id}">${id}</a></p>`
			}
			return ""
		}

		case "child_page": {
			const url = block.id
			const title = escapeHtml(block.child_page.title)
			return `<p><a class="page-mention" href="${url}">${title}</a></p>`
		}

		case "child_database": {
			// TODO: display database inline?
			const url = block.id
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
		for (const child of children) {
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
			html += await renderBlock(api, child)
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

	const property = page.properties.title
	if (property.type !== "title") throw new Error("Missing title: " + id)
	const title = renderRichText(property.title)

	return (
		`<h1>${title}</h1>` +
		(await renderBlockChildren(api, { id: page.id, has_children: true }))
	)
}

const rootPageId = toUuid("0e27612403084b2fb4a3166edafd623a")

async function main() {
	const cache = new Cache("data/cache2.db")
	const api = cache.api

	let html = await renderPage(api, rootPageId)

	html = `<head><meta charset="UTF-8"></head>` + html

	mkdirpSync(__dirname + "/../rendered")
	writeFileSync(__dirname + "/../rendered/" + rootPageId + ".html", html)
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
