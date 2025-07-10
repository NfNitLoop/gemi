#!/usr/bin/env -S deno run -ERW

import * as cts from "cmd-ts"

import { serve } from "./commands/serve.ts";
import { build } from "./commands/build.ts";

const app = cts.subcommands({
  name: "gemi",
  description: "A site builder & server for Gemini Text (gemtext)",
  cmds: {
    build,
    serve,
  },
})

if (import.meta.main) {
  await cts.run(app, Deno.args)
}
