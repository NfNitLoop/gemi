/**
 * @module
 * 
 * Tools for parsing gemtext.
 * 
 * 
 */

import {toTransformStream} from "@std/streams"

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

export function parseDoc(document: string): GemtextDoc {
    const lines = [...parseDocument(document)]
    const firstLine: Line|undefined = lines[0]
    const title = (
        firstLine && firstLine.type == "heading" && firstLine.level == 1
        ? firstLine.text.trim()
        : undefined
    )
    return {
        title,
        lines,
        get links() {
            return this.lines.filter(it => it.type == "link")
        }
    }
}

export type GemtextDoc = {
    title?: string
    readonly lines: Readonly<Line[]>
    readonly links: Readonly<Link[]>
}

export function newStreamParser(): TransformStream<string, Line> {
    return toTransformStream(async function* geminiLinegenerator(lines) {
        const {parseLine} = pushParser()
        for await (const line of lines) {
            const lineOut = parseLine(line)
            if (lineOut) { yield lineOut }
        }
    })
}

/**
 * Make a new push parser to parse a gemfile.
 * A push parser is usable from async or sync contexts.
*/
export function pushParser() {
    let parsingPre: ParsingPre  = undefined;
    const parseLine = (line: string): Line | null => {
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
                return outValue
            } else { // Start parsing new pre block:
                parsingPre = {
                    info: pre.info,
                    lines: []
                }
            }
            return null
        }
        if (parsingPre) {
            parsingPre.lines.push(line)
            return null
        }
        const link = parseLink(line)
        if (link) {
            return link
        }
        const heading = parseHeading(line)
        if (heading) {
            return heading
        }
        return {
            type: "text",
            text: line
        }
    }

    // TODO: add a done to return any dangling <pre>s.
    return {parseLine} 
}

// TODO: Use pushParser.
/**
 * Parse and yield lines of a Gemtext.
 */
export function * parseDocument(document: string): Generator<Line> {
    let parsingPre: ParsingPre  = undefined;
    for (const line of document.split(/\n/)) {
        const pre = parsePre(line)
        if (pre) {
            if (parsingPre) { // Wrap up & yield parsing.
                if (pre.info) {
                    throw new Error(`Expected end of preformatted block but found: ${line}`)
                }
                yield {
                    type: "pre",
                    lines: parsingPre.lines,
                    info: parsingPre.info
                }
                parsingPre = undefined
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

type ParsingPre = undefined | {
    info?: string
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

export type Line = Heading | Text | Link | Preformatted

export type Text = {
    type: "text",
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
