import { command } from "cmd-ts";

import * as cts from "cmd-ts"
import { createMiddleware, createFactory } from "@hono/hono/factory"
import { html, raw } from "@hono/hono/html"
import { accepts } from "@hono/hono/accepts"

import * as honoMime from "@hono/hono/utils/mime"

import * as gmi from "../lib/gemtext.ts"
import { Result } from "../lib/result.ts";
import { TextLineStream, toTransformStream } from "@std/streams";
import { $, type Path } from "@david/dax"
import type { MiddlewareHandler } from "@hono/hono/types";

export const serve = command({
    handler: runLocalServer,
    name: "serve",
    description: "Start up a simple HTTP server.",
    args: {
        port: cts.option({long: "port", type: cts.number, defaultValue: () => 8080}),
        path: cts.option({long: "serveDir", defaultValue: () => "."})
    },
})

type Args = {
    port: number
    path: string
}

async function runLocalServer({port, path}: Args) {

    const server = new Server({
        rootDir: $.path(path)
    })

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
    app.use(logger)
    app.use(server.gemToHtml)

    // Note, this SHOULD be unnecessary, since we have a pathRest match, below, but:
    // See: https://github.com/honojs/hono/issues/4384 
    // and: https://github.com/honojs/hono/issues/4385
    app.get("/", async (_c, next) => { 
        const response = await staticFiles.serveFile("")
        if (response) {
            return response
        }
        return next()
    })

    app.get(`/:pathRest{.*}`, async (c, next) => {
        // See: https://github.com/honojs/hono/issues/4384 
        const relPath: string|undefined = c.req.param("pathRest")
        if (!relPath) {
            return next()
        }

        const response = await staticFiles.serveFile(relPath)
        if (response) {
            return response
        }
        return next()
    })

    app.notFound((c) => {
        return c.text(`Not found: ${c.req.path}`, 404)
    })


    console.log(`Serving path: ${$.path(path).resolve()}`)
    if (await server.style.exists()) {
        console.log(`Found styles: ${server.style} ✅`)
    }
    Deno.serve({port}, app.fetch)
}



const logger = createMiddleware(async (ctx, next) => {
    const {req} = ctx
    const started = Date.now()

    const result = await Result.try(next())

    const elapsed = Date.now() - started
    const {res} = ctx
    const typeInfo = (res.headers.get("content-type") ?? "").startsWith("text/gemini") ? "Gemtext! 🎉" : ''
    console.log(req.method, res.status, `${elapsed}ms`, req.path, typeInfo)
    
    if (result.isError) {
        throw result.error
    }
})

const factory = createFactory({
    defaultAppOptions: {
        strict: true
    }
})

/**
 * Returns a handler that can generate a directory listing.
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

class Server {
    rootDir: Path
    style: Path

    constructor(args: {rootDir: Path}) {
        this.rootDir = args.rootDir.resolve()
        this.style = this.rootDir.resolve("style.css")
    }

    async getStyle() {
        const text = await this.style.readMaybeText()
        return text ?? defaultStyle
    }

    /**
     * Convert Gemini texts to HTML for browsers that don't know what to do with it.
     */
    readonly gemToHtml: MiddlewareHandler = async (c, next) => {
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
            .pipeThrough(toTransformStream(this.gmiLinesToHtml.bind(this)))
            .pipeThrough(new TextEncoderStream())


        c.res = new Response(newStream, {
            headers: {
                "Content-Type": "text/html; charset=utf-8"
            }
        })
        // TODO: Copy other headers?
    }

    async * gmiLinesToHtml(linesInput: AsyncIterable<gmi.Line>): AsyncGenerator<string> {

        const [firstLine, lines] = await asyncPeek(linesInput)

        const title = (
            firstLine.done ? undefined 
            : firstLine.value.type != "heading" ? undefined
            : firstLine.value.level != 1 ? undefined
            : firstLine.value.text
        )

        yield html`<!doctype html>\n`
        yield html`<html>\n`
        yield html`<head>\n`
        if (title) {
            yield html`<title>${title}</title>\n`
        }
        yield html`<meta name="viewport" content="width=device-width, initial-scale=1.0">\n`

        yield html`<style>\n`
        yield raw(await this.getStyle())
        yield `\n`
        yield html`</style>\n`

        yield html`</head>\n`
        yield html`<body>\n`;
        
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

}

async function asyncPeek<T>(iterable: AsyncIterable<T>): Promise<[IteratorResult<T>, AsyncIterable<T>]> {
    const iter = iterable[Symbol.asyncIterator]()
    const first = await iter.next()

    async function * newIterable(): AsyncIterable<T> {
        await using cleanup = new AsyncDisposableStack()
        cleanup.defer(async () => { await iter.return?.() })

        if (first.done) {
            return
        }
        yield first.value
        while (true) {
            const next = await iter.next()
            if (next.done) { return }
            yield next.value
        }
    }

    return [first, newIterable()]
}

const defaultStyle = `
html {
    font-family: sans-serif;
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
li { margin-left: 1em; }

blockquote {
    margin: 0 1em;
    border-left: 2px solid rgba(0, 0, 0, 0.5);
    padding-left: 1em;
    margin-left: 0;
}
`.trim()


// Hono's serveStatic doesn't seem to serve index files.
// Also, you can't easily call it to just serve a single file as needed.
// Plus, it uses sync functions. (😱)
// So, writing my own handler here.
class StaticFiles {
    rootDir: Path
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
        
        this.rootDir = $.path(rootDir).resolve()
        this.indexes = indexes ?? []
        this.mimes = {
            ...honoMime.mimes,
            ...extraMimes
        }
        this.listDirectory = listDirectory
    }

    async serveFile(relPath: string): Promise<Response|null> {
        const pathParts = relPath.split(/[/\\]/)
        if (this.#blockedPath(pathParts)) {
            return null
        }
        const fullPath = this.rootDir.join(...pathParts)
        if (!fullPath.startsWith(this.rootDir)) {
            console.warn(`Path "${relPath}" exited the root path!? (${this.rootDir})`)
            return null
        }
        const file = await openFile(fullPath.toString())
        if (!file) { 
            // Neither a file nor directory
            return null
        }
        const stat = await file.stat()
        if (stat.isFile) {
            // TODO: Default to utf-8 for text types w/o encodings.
            let mimeType = honoMime.getMimeType(fullPath.basename().toLowerCase(), this.mimes)
            if (!mimeType) {
                console.warn("Unknown mime type for:", relPath)
                mimeType = "application/octet-stream"
            }

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
            const newPath = `/${relPath}/`
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
        return this.listDirectory({relPath, fullPath: fullPath.toString()})
    }

    #blockedPath(parts: string[]) {
        for (const part of parts) {
            if (part.startsWith(".") && part != ".well-known") {
                return true
            }
        }
        return false
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