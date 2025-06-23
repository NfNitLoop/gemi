import { newStreamParser } from "./gemtext.ts"
import { TextLineStream } from "@std/streams"
import { assertEquals } from "@std/assert"



Deno.test("parsing via streams", async () => {
    const stream = ReadableStream.from([testDoc])
        .pipeThrough(new TextLineStream())
        .pipeThrough(newStreamParser())

    const values = []
    for await (const value of stream.values()) {
        values.push(value)
    }

    assertEquals(values, testDocExpected as unknown)

})

const testDoc = `
# This is the title

${"```"}
block starts
line 2
${"```"}

=> https://www.google.com
`.trim()

const testDocExpected = [
    { type: "heading", level: 1, text: "This is the title" },
    { type: "text", text: "" },
    {
        type: "pre",
        info: undefined,
        lines: ["block starts", "line 2"],
    },
    { type: "text", text: "" },
    {
        type: "link",
        urlOrPath: "https://www.google.com",
        linkText: undefined
    }
] as const