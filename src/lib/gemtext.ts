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

export function newStreamParser(): TransformStream<string, Line> {
    return toTransformStream(parseLines)
}

export function parseByteStream(stream: ReadableStream<Uint8Array>): AsyncIterable<Line> {
    return stream.pipeThrough(new TextDecoderStream())
        .pipeThrough(new TextLineStream())
        .pipeThrough(newStreamParser())
}


async function * parseLines(lines: AsyncIterable<string>): AsyncIterable<Line> {
    let parsingPre: ParsingPre  = undefined;
    let parsingBq: ParsingBlockquote = undefined;

    for await (const line of lines) {
        const pre = parsePre(line)
        if (pre) {
            if (parsingPre) { // Wrap up & yield parsing.
                if (pre.info) {
                    throw new Error(`Expected end of preformatted block but found: ${line}`)
                }
                const outValue = {
                    type: "pre",
                    lines: parsingPre.lines,
                    info: parsingPre.info
                } as const
                parsingPre = undefined
                yield outValue
            } else { // Start parsing new pre block:
                parsingPre = {
                    info: pre.info,
                    lines: []
                }
            }
            continue
        }
        if (parsingPre) {
            parsingPre.lines.push(line)
            continue
        }
        const bq = parseBq(line)
        if (bq) {
            if (!parsingBq) {
                parsingBq = { lines: [] }
            }
            parsingBq.lines.push(bq.line)
            continue
        }
        // so: !bq. Yield the block we'd collected:
        if (parsingBq) {
            yield {
                type: "blockQuote",
                lines: parsingBq.lines
            }
            parsingBq = undefined
        }
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
        const li = parseListItem(line)
        if (li) {
            yield li
            continue
        }
        yield {
            type: "text",
            text: line
        }
    }

    // Yield any open blocks that are now finished:
    if (parsingPre) {
        yield {
            type: "pre",
            lines: parsingPre.lines,
            info: parsingPre.info
        }
    }
    if (parsingBq) {
        yield {
            type: "blockQuote",
            lines: parsingBq.lines
        }
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

// Remembers that we're collecting things into a <pre> block.
type ParsingPre = undefined | {
    info?: string
    lines: string[]
}

// Same, but for blockquote.
type ParsingBlockquote = undefined | {
    lines: string[]
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

function parseBq(line: string): null | { line: string } {
    const match = BLOCK_QUOTE_RE.exec(line)
    if (!match) { return null }
    return {
        line: match.groups!.line
    }
}

const BLOCK_QUOTE_RE = /^>[ ]?(?<line>.*)$/

function parseListItem(line: string): null | ListItem {
    const match = LIST_ITEM_RE.exec(line)
    if (!match) { return null }
    return {
        type: "listItem",
        text: match.groups!.text
    }
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

export type Line = Heading | Text | Link | Preformatted | BlockQuote | ListItem

export type Text = {
    type: "text",
    text: string,
}

export type ListItem = {
    type: "listItem",
    text: string,
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
