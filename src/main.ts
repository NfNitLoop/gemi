#!/usr/bin/env -S deno run -ERW

import * as cts from "cmd-ts"

import { PrivateKey } from "./lib/keys.ts";
import { localServer } from "./local-serve.ts";
import { hash } from "./commands/hash.ts"
import { sign } from "./commands/sign.ts";
import { build } from "./commands/build.ts";

const example = cts.command({
  name: "whatever, man",
  args: {
    someArg: cts.positional({ type: cts.string, displayName: "someArg"}),
    someFlag: cts.option({ long: "someFlag"})
  },
  handler: (args) => {
    console.log(args)
  },
});

const newKey = cts.command({
  name: "New key",
  description: "Generate a new private key (user ID)",
  args: {

  },
  handler: () => {
    const priv = PrivateKey.createNew()
    console.log(" UserID:", priv.userID.asBase58)
    console.log("Private:", priv.asBase58)
  }
})

const app = cts.subcommands({
  name: "dko",
  description: "The new DisKutO tool.",
  cmds: {
    newKey,
    localServer,
    hash,
    example,
    sign,
    build
  },
})

if (import.meta.main) {
  await cts.run(app, Deno.args)
}
