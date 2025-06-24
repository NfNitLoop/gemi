/**
 * @module
 * A gemtextManifest is a way to list a manifest of files that are related to a piece of Gemini content. (usually: a page).
 * 
 * The rough instructions for constructing a manifest are:
 * 
 * 1. List the files in a directory.
 * 2. Calculate their hashes and sizes.
 * 3. Render that into a gemtext.
 * 4. Prepend lines containing metadata: 
 *    required at top: a (v7) uuid (which includes a timestamp) 
 *    optional: utcOffset in minutes. ex: -480
 *    optional: modified: utc-milliseconds to show that this content was modified after its initial publication. (allows for newest-wins deduplication)
 * 5. Sign the contents of this file, and prepend lines containing 'userId:' and 'signature:'
 * 
 * The resulting file:
 * 1. Can be read by a human directly
 * 2. Can be rendered by a Gemtext browser
 * 3. Can be verified automatically.
 * 4. Gives this content a unique ID so that it can be deduplicated.
 */

import { hashDir } from "./hashing.ts";
import * as uuid7 from "@std/uuid/unstable-v7"
import * as uuid from "@std/uuid"
import * as hex from "@std/encoding/hex"
import bs58 from "bs58"
import { PrivateKey } from "./keys.ts";

export function signManfiest(args: {privKey: PrivateKey, manifest: string}): string {
    const {privKey, manifest} = args
    const sig = privKey.sign(new TextEncoder().encode(manifest))
    const uid = privKey.userID
    return [
        `userId: ${uid.asBase58}`,
        `signature: ${sig.asBase58}`,
        manifest
    ].join("\n")
}


export async function makeUnsignedManifest(dirPath: string): Promise<string> {
    const info = await hashDir({dirPath})
    info.sort(hashesSort)

    const id = UUIDv7.create()

    const lines = [
        `uuid: ${id}`,
        `utcOffset: ${-new Date().getTimezoneOffset()}`,
        ``,
    ]
    for (const {name, hash, bytes} of info) {
        lines.push(`=> ${encodeURI(name)}`)
        lines.push(`hash: ${hash.asBase58}`)
        lines.push(`bytes: ${bytes}`)
        lines.push(``)
    }

    return lines.join("\n")
}


type HashInfo = Awaited<ReturnType<typeof hashDir>>[number]


function hashesSort(a: HashInfo, b: HashInfo): number {
    const aIndex = a.name.startsWith("index.")
    const bIndex = b.name.startsWith("index.")
    if (aIndex != bIndex) {
        return aIndex ? -1 : 1
    }
    
    if (a.name == b.name) {
        // Shouldn't really happen but:
        return 0
    }
    return a.name < b.name ? -1 : 1
}

class UUIDv7 {
    readonly #value: string
    get value() { return this.#value }

    // Init with the value that @std/uuid prefers.
    constructor(value: string) {
        if (!uuid.validate(value)) {
            throw new Error(`Invalid UUID: ${value}`)
        }
        const version = uuid.version(value)
        if (version != 7) {
            throw new Error(`Expected UUID v7, but got v${version}`)
        }

        this.#value = value
    }

    static create(timestamp?: number) {
        return new UUIDv7(uuid7.generate(timestamp))
    }

    get asBase58(): string {
        const bytes = hex.decodeHex(this.#value.replaceAll("-", ""))
        return bs58.encode(bytes)
    }

    get timestampUtcMs(): number {
        return uuid7.extractTimestamp(this.#value)
    }

    static fromBase58(value: string) {
        const bytes = bs58.decode(value)
        console.log(bytes.length, "bytes")
        const hexxed = hex.encodeHex(bytes)

        // Deno's uuid is very particular that these bytes have dashes between them 🙄
        const dashed = [
            hexxed.substring(0, 8),
            hexxed.substring(8, 12),
            hexxed.substring(12, 16),
            hexxed.substring(16, 20),
            hexxed.substring(20)
        ].join("-")

        return new UUIDv7(dashed)
    }

    toString() {
        return this.asBase58
    }
}