import {crypto} from "@std/crypto"
import bs58 from "bs58"

export class Sha256 {
    readonly bytes: Uint8Array

    constructor(bytes: Uint8Array) {
        if (bytes.length != 32) {
            throw new Error(`Expected 32 bytes, found ${bytes.length}`)
        }
        this.bytes = bytes
    }

    /**
     * Note: a ReadableStream is also an AsyncIterable.
     */
    static async fromStream(stream: AsyncIterable<Uint8Array>): Promise<Sha256> {
        const buf = await crypto.subtle.digest('SHA-256', stream)
        const bytes = new Uint8Array(buf)
        return new Sha256(bytes)
    }

    static fromString(value: string): Sha256 {
        const bytes = bs58.decode(value)
        return new Sha256(bytes)
    }

    equals(other: Sha256): boolean {
        const thisBytes = this.bytes
        const otherBytes = other.bytes
        for (let i = 0; i < thisBytes.length; i++) {
            if (thisBytes[i] != otherBytes[i]) {
                return false
            }
        }
        return true
    }

    toString() {
        return this.asBase58
    }

    get asBase58(): string {
        return bs58.encode(this.bytes)
    }

    [Symbol.for("Deno.customInspect")]() {
        return this.toString()
    }
}

export async function hashDir(args: {dirPath: string, ignored?: string[]}) {
    const {dirPath} = args
    const ignored = new Set(args.ignored ?? ["sig.gmi"])

    const results = []

    // TODO: Recursive. (walk function?)
    const entries = Deno.readDir(dirPath)
    for await (const entry of entries) {
        if (!entry.isFile) { continue }
        if (ignored.has(entry.name)) { continue }
        const info = await hashFile(entry.name)
        results.push({
            ...info,
            name: entry.name
        })
    }

    return results
}

export async function hashFile(path: string) {
    const f = await Deno.open(path)
    const stat = await f.stat()
    if (!stat.isFile) {
        throw new Error(`Path is not a file: ${path}`)
    }

    const hash = await Sha256.fromStream(f.readable)
    return {
        hash,
        bytes: stat.size
    }
}
