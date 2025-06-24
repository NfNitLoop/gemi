import { command, subcommands } from "cmd-ts";
import * as cts from "cmd-ts"
import { hashDir, hashFile, Sha256 } from "../lib/hashing.ts";
import { makeUnsignedManifest } from "../lib/gemtextManifest.ts";

const file = command({
    name: "file",
    description: "Generate a SHA-256 hash of a file",
    args: {
        fileName: cts.positional({type: cts.string})
    },
    handler: hashFileCommand
})

const dir = command({
    name: "dir",
    description: "Generate a SHA-256 hash of a directory",
    args: {
        dirPath: cts.positional({type: cts.string})
    },
    handler: hashDirCommand
})

export const hash = subcommands({
    name: "hash",
    description: "Hash functions",
    cmds: {file, dir}
})

async function hashFileCommand(args: {fileName: string}): Promise<void> {
    const {fileName} = args
    const {hash} = await hashFile(fileName)
    console.log(hash.asBase58)
}


async function hashDirCommand(args: {dirPath: string}) {
    const {dirPath} = args
    const info = await makeUnsignedManifest(dirPath)
    console.log(info)
}