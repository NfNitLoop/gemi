/**
 * @module
 * 
 * Tools for parsing gemtext.
 * 
 * 
 */

import {TextLineStream, toTransformStream} from "@std/streams"

export const extensions = [`.gmi`, `.gmni`, `.gemini`] as const
export const mimeType = "text/gemini"
export const mimeTypes = {
    gmi: mimeType,
    gmni: mimeType,
    gemini: mimeType,
} as const

/**
 * @returns true iff fileName ends with a gemini extension.
 */
export function hasExtension(fileName: string): boolean {
    fileName = fileName.slice(-7).toLowerCase()
    return extensions.some(ext => fileName.endsWith(ext))
}

export function newStreamParser(): TransformStream<string, Chunk> {
    return toTransformStream(parseLines)
}

export function parseByteStream(stream: ReadableStream<Uint8Array>): AsyncIterable<Chunk> {
    return stream.pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream())
    .pipeThrough(newStreamParser())
}


async function * parseLines(linesIterable: AsyncIterable<string>): AsyncIterable<Chunk> {
    const lines = new Peeker(linesIterable[Symbol.asyncIterator]())
    async function hasMoreLines() { return !(await lines.peek()).done }
    
    while (await hasMoreLines()) {
        // These blocks take highest priority and can parse multiple lines until they reach their end delimiter:
        const pre = await parsePreBlock(lines)
        if (pre) { yield pre; continue }

        const bq = await parseBqBlock(lines)
        if (bq) { yield bq; continue }

        const list = await parseList(lines)
        if (list) { yield list; continue }

        // Otherwise, we're parsing one line at a time:
        const {value: line} = await lines.next()

        const link = parseLink(line)
        if (link) {
            yield link
            continue
        }
        const heading = parseHeading(line)
        if (heading) {
            yield heading
            continue
        }
        yield {
            type: "text",
            text: line
        }
    }

}

class Peeker<T> implements AsyncIterator<T> {
    #inner: AsyncIterator<T>

    #peeked: IteratorResult<T>|null = null
    
    constructor(inner: AsyncIterator<T>) {
        this.#inner = inner
    }
    
    // deno-lint-ignore require-await
    async next(): Promise<IteratorResult<T>> {
        if (this.#peeked) {
            const out = this.#peeked
            this.#peeked = null
            return out
        }

        return this.#inner.next()
    }

    async peek(): Promise<IteratorResult<T>> {
        this.#peeked ??= await this.#inner.next()
        return this.#peeked
    }

    /** pop the peeked value (if it was peeked) */
    pop(): void {
        this.#peeked = null
    }
}


function parseHeading(line: string): null | Heading {
    const match = HEADING_RE.exec(line)
    if (!match) { return null }
    const {h, text} = match.groups!
    return {
        type: "heading",
        level: h.length as 1|2|3,
        text
    }
}

const HEADING_RE = /^(?<h>#{1,3}) (?<text>.+)$/

async function parsePreBlock(lines: Peeker<string>): Promise<Preformatted|null> {
    const first = await lines.peek()
    if (first.done) { return null }
    const info = parsePre(first.value)
    if (!info) { return null }

    lines.pop()

    const preLines = []

    while (true) {
        const {value: line, done} = await lines.next()
        if (done) { break }

        const pre = parsePre(line)
        if (pre) { break }
        
        preLines.push(line)
    }

    return {
        type: "pre",
        info: info.info,
        lines: preLines,
    }
}

function parsePre(line: string): null | { info?: string} {
    const match = PRE_RE.exec(line)
    if (!match) { return null }
    const {info} = match.groups!
    return {
        info: info || undefined
    }
}

const PRE_RE = /^```\s*(?<info>.*)$/

async function parseBqBlock(iter: Peeker<string>): Promise<BlockQuote|null> {
    const lines: string[] = []

    while (true) {
        const {value: line, done} = await iter.peek()
        if (done) { break }

        const quoted = parseBq(line)
        if (!quoted) { break }

        lines.push(quoted.line)
        iter.pop()
    }

    if (lines.length == 0) {
        return null
    }
    return {
        type: "blockQuote",
        lines
    }
}

function parseBq(line: string): null | { line: string } {
    const match = BLOCK_QUOTE_RE.exec(line)
    if (!match) { return null }
    return {
        line: match.groups!.line
    }
}

const BLOCK_QUOTE_RE = /^>[ ]?(?<line>.*)$/

async function parseList(iter: Peeker<string>): Promise<List|null> {
    const items: string[] = []

    while (true) {
        const {value: line, done} = await iter.peek()
        if (done) { break }

        const item = parseListItem(line)
        if (item === null) { break }

        items.push(item)
        iter.pop()
    }

    if (items.length == 0) {
        return null
    }

    return {
        type: "list",
        items
    }
}

function parseListItem(line: string): null | string {
    const match = LIST_ITEM_RE.exec(line)
    return match?.groups?.text ?? null
}

const LIST_ITEM_RE = /^[*][ ]?(?<text>.*)$/


function parseLink(line: string): Link | null {
    const match = LINK_RE.exec(line)
    if (!match) { return null }
    const {urlOrPath, linkText} = match.groups!
    
    return {
        type: "link",
        urlOrPath: decodeURI(urlOrPath),
        linkText: linkText || undefined
    }
}

const LINK_RE = /^=> (?<urlOrPath>\S+)\s*(?<linkText>.*)$/

export type Chunk = Heading | Text | Link | Preformatted | BlockQuote | List

// TODO: Group blank lines into the previous paragraph so we can render with <br> instead of empty paragraphs?
export type Text = {
    type: "text",
    text: string,
}

export type List = {
    type: "list",
    items: string[]
}

export type Heading = {
    type: "heading"
    level: 1 | 2 | 3
    text: string
}

export type Link = {
    type: "link"
    urlOrPath: string
    linkText?: string
}

/** Collects multiple lines of preformatted text into one block. */
export type Preformatted = {
    type: "pre"
    lines: string[]
    
    /** The info optionally provided with the opening of the preformatted block */
    info?: string
}

/** Groups consecutive block-quoted lines together. */
export type BlockQuote = {
    type: "blockQuote"

    // Spec says these are always plaintext, but this *could* be a Line[]?
    lines: string[]
}
