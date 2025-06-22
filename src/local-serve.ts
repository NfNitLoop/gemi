import { command } from "cmd-ts";

import * as cts from "cmd-ts"
import { Hono } from "@hono/hono"
import { logger } from "@hono/hono/logger"
import { serveStatic } from "@hono/hono/deno"
import { createMiddleware } from "@hono/hono/factory"
import {html} from "@hono/hono/html"

import * as gmi from "./lib/gemtext.ts"
import { HtmlEscapedString } from "@hono/hono/utils/html";

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
    const app = new Hono({strict: true})

    // Must register middleware before routes:
    app.use(logger())
    app.use(renderGemtext)

    app.get("/", (c) => { 
        return new Response(`Hello! ... ${c.req.url}`)
    })

    app.get(`/:pathRest{.*}`, serveStatic({
        root: path,
        mimes: gmi.mimeTypes,
    }))

    // TODO: Add directory listings here.
    app.get(`/:pathRest{.*}`, (c) => c.text('not found'))

    Deno.serve({port}, app.fetch)
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
    console.log({isGemini, contentType})
    // check accepts encoding. Pass through gemini unmodified to clients that know it.

    const oldResponse = c.res
    const {body} = oldResponse

    // TODO: I can probably do this in a streaming fashion, spitting out an HTML head, converting by lines, and then an HTML footer.
    // For now, just doing a whole-document conversion:
    const gemText = await oldResponse.text()
    console.log({gemText})

    const gemLines = [...gmi.parseLines(gemText)]
    console.log({gemLines})

    c.res = new Response(await htmlDoc([...gmiToHtml(gemLines)]), {
        headers: {
            "Content-Type": "text/html; charset=utf-8"
        }
    })
    // TODO: Copy other headers?
})

function * gmiToHtml(lines: Iterable<gmi.Line>): Generator<HtmlEscapedString | Promise<HtmlEscapedString>> {
    for (const line of lines) {
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
            yield html`<p><a href="${urlOrPath}">${text}</a></p>\n`
        } else if (line.type == "pre") {
            yield html`<pre>${line.lines.join("\n")}</pre>\n`
        } else {
            const lineType: never = line
            throw new Error(`Unhandled line type: ${(lineType as gmi.Line).type}`)
        }
    }
}

type HtmlOut = ReturnType<typeof html>

function htmlDoc(parts: HtmlOut[]): HtmlOut {
    const doc = [
        html`<!doctype html>\n`,
        html`<html>\n`,
        html`<head>\n`,
        gemStyle,
        html`</head>`,
        html`<body>`,
        html`${parts}`,
        html`</body>`,
        html`</html>`,
    ]

    return html`${doc}`
}

const gemStyle = html`
<style>
html {
    font-family: sans-serif;
    background-color: rgb(255, 255, 209);
    opacity: 0.75;
}
body {
    padding: 1rem;
    margin: 0 auto;
    &:not(:has(pre)) {
        max-width: 45rem;
    }
}

p, h1, h2, h3, pre {
    margin: 0 0;
    min-height: 1em;
}


body > h1:first-child {
    text-align: center;
}

p {
    line-height: 1.5;
}
</style>
`


// p:has(a[href])::before {
//     content: "=> ";
//     font-family: monospace;
//     // font-weight: bold;
//     font-size: 1.1em;
// }

// pre {
//     overflow-x: auto;
// }
