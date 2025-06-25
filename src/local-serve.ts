import { command } from "cmd-ts";

import * as cts from "cmd-ts"
import { logger } from "@hono/hono/logger"
import { createMiddleware, createFactory } from "@hono/hono/factory"
import { html } from "@hono/hono/html"
import { accepts } from "@hono/hono/accepts"

import * as honoMime from "@hono/hono/utils/mime"

import * as gmi from "./lib/gemtext.ts"
import { HtmlEscapedString } from "@hono/hono/utils/html";
import { Result } from "./lib/result.ts";
import { TextLineStream, toTransformStream } from "@std/streams";

export const localServer = command({
    handler: runLocalServer,
    name: "localServer",
    description: "Run a local server for some content",
    args: {
        port: cts.option({long: "port", type: cts.number, defaultValue: () => 8080}),
        path: cts.option({long: "serveDir", defaultValue: () => "."})
    },
})

type Args = {
    port: number
    path: string
}

function runLocalServer({port, path}: Args) {

    const staticFiles = new StaticFiles({
        rootDir: path,
        extraMimes: gmi.mimeTypes,
        indexes: [
            ...gmi.extensions.map(ext => `index${ext}`),
            'index.html',
            'index.htm',
        ],
        listDirectory: showListing
    })

    const app = factory.createApp()
    // Must register middleware before routes:
    app.use(logger())
    app.use(renderGemtext)


    app.get(`/:pathRest{.*}`, async (c, next) => {
        const response = await staticFiles.serveFile(c.req.param().pathRest)
        if (!response) {
            return next()
        }
        return response
    })

    app.get("/", async (_c, next) => { 
        const response = await staticFiles.serveFile("")
        if (response) {
            return response
        }
        return next()
    })

    app.notFound((c) => {
        return c.text(`Not found: ${c.req.path}`, 404)
    })


    Deno.serve({port}, app.fetch)
}

const factory = createFactory({
    defaultAppOptions: {
        strict: true
    }
})

/**
 * Returns a handler that can 
 */
async function showListing(args: {fullPath: string, relPath: string}): Promise<Response> {
    const {fullPath, relPath} = args


    const lines = [
        `# Directory Listing`,
        '',
        `### ${relPath || '/'}`,
        '',
    ]
    const dir = Deno.readDir(fullPath)
    for await (const entry of dir) {
        if (entry.isSymlink) { continue }
        const name = entry.name + (entry.isDirectory ? "/" : "")
        if (name.startsWith(".")) { continue }
        lines.push(`=> ${encodeURI(name)}`)
    }

    return new Response(lines.join("\n"), {
        headers: {
            "Content-Type": gmi.mimeType
        }
    })
}

/**
 * Convert Gemini texts to HTML for browsers that don't know what to do with it.
 */
const renderGemtext = createMiddleware(async (c, next) => {
    await next()

    const contentType = c.res.headers.get("content-type")
    const isGemini = contentType?.startsWith(gmi.mimeType)
    if (!isGemini) {
        // nothing to do:
        return
    }

    const outputType = accepts(c, {
        header: "Accept",
        supports: [
            gmi.mimeType,
            "text/html"
        ],
        // Most browsers don't know how to render gemini.
        // default: "text/html"
        // However, they generally provide an Accept header with html.
        // For anything else (ex: curl) just return Gemtext:
        default: gmi.mimeType
    })

    if (outputType == gmi.mimeType) {
        // input & output agree! 🎉
        return
    }

    const oldResponse = c.res

    const {body} = oldResponse
    if (!body) {
        console.warn("old response had no body!?")
        return
    }

    const newStream = body.pipeThrough(new TextDecoderStream())
        .pipeThrough(new TextLineStream())
        .pipeThrough(gmi.newStreamParser())
        .pipeThrough(toTransformStream(gmiLinesToHtml))
        .pipeThrough(new TextEncoderStream())


    c.res = new Response(newStream, {
        headers: {
            "Content-Type": "text/html; charset=utf-8"
        }
    })
    // TODO: Copy other headers?
})

async function * gmiLinesToHtml(lines: AsyncIterable<gmi.Line>): AsyncGenerator<string> {
    yield html`<!doctype html>\n`
    yield html`<html>\n`
    yield html`<head>\n`
    yield gemStyle
    yield html`</head>\n`
    yield html`<body>\n`;
    
    // TODO: Peek at the first line to see if it's a title.

    for await (const line of lines) {
        if (line.type == "text") {
            yield html`<p>${line.text}</p>\n`
        } else if (line.type == "heading") {
            const {level, text} = line
            yield (
                level == 1 ? html`<h1>${text}</h1>\n`
                : level == 2 ? html`<h2>${text}</h2>\n`
                : html`<h3>${text}</h3>\n`
            )
        } else if (line.type == "link") {
            const {urlOrPath} = line
            const text = line.linkText ?? urlOrPath
            yield html`<p><a href="${encodeURI(urlOrPath)}">${text}</a></p>\n`
        } else if (line.type == "pre") {
            yield html`<pre>${line.lines.join("\n")}</pre>\n`
        } else if (line.type == "listItem") {
            yield html`<li>${line.text}</li>\n`
        } else if (line.type == "blockQuote") {
            yield html`<blockquote>\n`
            for (const innerLine of line.lines) {
                yield html` <p>${innerLine}</p>\n`
            }
            yield html`</blockquote>\n`
        } else {
            const lineType: never = line
            throw new Error(`Unhandled line type: ${(lineType as gmi.Line).type}`)
        }
    }
    yield html`</body>`
    yield html`</html>`
}

const gemStyle = html`
<style>
html {
    font-family: sans-serif;
    background-color: rgb(255, 255, 209);
    opacity: 0.75;
    word-wrap: break-word;
    text-align: justify;
}
body {
    padding: 1rem;
    margin: 0 auto;
    max-width: 40rem;
}
p, h1, h2, h3, pre {
    margin: 0 0;
    min-height: 1em;
}
pre {
    overflow-x: auto;
}
body > h1:first-child { text-align: center; }
p, li, pre { line-height: 1.5; }
li {
    list-style: inside;
}

blockquote {
    // background-color: white;
    margin: 0 1em;
    border-left: 2px solid rgba(0, 0, 0, 0.5);
    padding-left: 1em;
    margin-left: 0;
}

</style>
`

// Hono's serveStatic doesn't seem to serve index files.
// Also, you can't easily call it to just serve a single file as needed.
// Plus, it uses sync functions. (😱)
// So, writing my own handler here.
class StaticFiles {
    rootDir: string
    indexes: string[]
    mimes: { [x: string]: string; };
    listDirectory?: (args: {relPath: string, fullPath: string}) => Promise<Response>

    constructor(args: {
        rootDir: string,
        extraMimes?: Record<string, string>,
        indexes?: string[],
        listDirectory?: StaticFiles["listDirectory"]
    }) {
        const {rootDir, extraMimes, indexes, listDirectory} = args
        
        this.rootDir = rootDir
        this.indexes = indexes ?? []
        this.mimes = {
            ...honoMime.mimes,
            ...extraMimes
        }
        this.listDirectory = listDirectory
    }

    // TODO: Disallow /../ !!!!
    async serveFile(relPath: string): Promise<Response|null> {
        const fullPath = this.#join(this.rootDir, relPath)
        const file = await openFile(fullPath)
        if (!file) { 
            // Neither a file nor directory
            return null
        }
        const stat = await file.stat()
        if (stat.isFile) {
            // TODO: Default to utf-8 for text types w/o encodings.
            const mimeType = honoMime.getMimeType(fullPath, this.mimes) ?? "application/octet-stream"

            return new Response(
                file.readable,
                { headers: { "Content-Type": mimeType } }
            )
        }

        if (!stat.isDirectory) {
            // No support for symlinks. (yet)
            return null
        }
        if (!relPath.endsWith("/") && relPath != "") {
            const newPath = relPath + "/"
            return new Response("", {
                headers: {"Location": newPath},
                status: 302 // temporary redirect
            })
        }

        // We're in a directory, and have a trailing slash.
        // Try index files:
        for (const index of this.indexes) {
            const indexPath = this.#join(relPath, index)
            const response = await this.serveFile(indexPath)
            if (response) {
                return response
            }
        }

        // List files:
        if (!this.listDirectory) {
            return null
        }
        return this.listDirectory({relPath, fullPath})
    }

    #join(path1: string, path2: string) {
        // Remove trailing/leading slashes to join with a slash.
        // TODO: Handle how this works on Windows?
        return path1.replace(/\/+$/, "") + "/" + path2.replace(/^\/+/, "")
    }
}

async function openFile(path: string): Promise<Deno.FsFile | null> {
    const result = await Result.try(Deno.open(path, {read: true, }))
    if (result.isError) {
        if (result.error instanceof Deno.errors.NotFound) {
            return null
        }
        throw result.error
    }
    return result.value
}