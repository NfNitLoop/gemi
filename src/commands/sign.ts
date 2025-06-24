import { command } from "cmd-ts";
import * as cts from "cmd-ts"
import { makeUnsignedManifest, signManfiest } from "../lib/gemtextManifest.ts";
import { PrivateKey } from "../lib/keys.ts";
import { Result } from "../lib/result.ts";
import * as stdPath from "@std/path"

export const sign = command({
    name: "sign",
    description: "Create and sign a manifest for this directory",
    args: {
        dirPath: cts.positional({
            displayName: "dirPath",
            type: cts.string,
        }),
        sigFile: cts.option({
            long: "signatureFile",
            description: "The file to put the signature and manifest into.",
            defaultValue: () => `sig.gmi`,
            defaultValueIsSerializable: true,
        })
    },
    handler: signCommand
})

async function signCommand(args: {dirPath: string, sigFile: string}): Promise<void> {
    const {dirPath, sigFile} = args
    const sigPath = stdPath.join(dirPath, sigFile)
    const stat = await fsStat(sigPath)
    if (stat) {
        throw new Error(`File already exists: ${sigPath}`)
    }

    const privKeyString = prompt("Private key")
    if (!privKeyString) { return }
    const privKey = PrivateKey.fromBase58(privKeyString)

    const manifest = await makeUnsignedManifest(dirPath)
    const signed = signManfiest({manifest, privKey})
    await Deno.writeTextFile(sigPath, signed)
    console.log(signed)
    console.log(`✅ Done`)
}

async function fsStat(path: string): Promise<Deno.FileInfo | null> {
    const response = await Result.try(Deno.stat(path))
    if (!response.isError) {
        return response.value
    }
    if (response.error instanceof Deno.errors.NotFound) {
        return null
    }
    throw response.error
}