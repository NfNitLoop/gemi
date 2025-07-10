import { type } from "arktype";
import { command } from "cmd-ts";
import * as cts from "cmd-ts";
import { $, Path } from "@david/dax";
import * as toml from "@std/toml";
import { Line, parseByteStream } from "../lib/gemtext.ts";
import {DateTime} from "luxon"

export const build = command({
  name: "build",
  description: "Build a site -- generate indexes, etc.",
  args: {
    configPath: cts.option({
      long: "configPath",
      type: cts.string,
      description: "Path to load the config file from",
      defaultValue: () => "./.gemi.toml",
    }),
  },
  handler: buildHandler,
});

type Args = {
  configPath: string;
};

async function buildHandler(args: Args) {
  const { configPath } = args;

  const config = await loadConfig(configPath);

  for (const root of config.roots) {
    await doBuild($.path(configPath).parent()!, root);
  }
}

async function doBuild(configDir: Path, root: SiteRoot) {
  const rootPath = configDir.resolve(root.path)
  if (!await rootPath.exists()) {
    throw new Error(`No such path: ${rootPath.toString()}`)
  }
  const indexOut = rootPath.resolve(root.index.out)
  const indexOutDir = indexOut.parentOrThrow()

  // TODO: Make configurable.
  const indexes = ["index.gmi", "index.gmni", "index.gemini"]

  const posts: PostInfo[] = []

  for await (const entry of walkDir(rootPath)) {
    if (entry.path.equals(indexOut)) {
      // console.debug("Skipping index:", entry.path.toString())
      continue
    }
    if (!indexes.includes(entry.name)) {
      continue
    }
    const {title, date}= await getMeta(entry.path)
    if (!title) {
      console.warn("Missing title:", entry.path.toString())
      continue
    }
    if (!date) {
      console.warn("missing date:", entry.path.toString())
      continue
    }
    posts.push({
      path: entry.path,
      title,
      date
    })
  }

  posts.sort(sortPosts)

  const lines: string[] = []
  if (root.index.title) {
    lines.push(
      `# ${root.index.title}`,
      ``
    )
  }
  for (const post of posts) {
    const day = post.date.toFormat("yyyy-MM-dd")
    const postDir = post.path.parentOrThrow()
    const relPath = indexOutDir.relative(postDir) + "/"
    lines.push(`=> ${encodeURI(relPath)} ${day} ${post.title}`)
    
  }

  const file = await indexOut.open({ write: true })
  await ReadableStream.from(lines.map(it => it + "\n"))
    .pipeThrough(new TextEncoderStream())
    .pipeTo(file.writable)

  console.log("✅ Updated", indexOut.toString())
}

type PostInfo = {
  path: Path
  title: string
  date: DateTime
}

function sortPosts(lhs: PostInfo, rhs: PostInfo): number {
  return rhs.date.toMillis() - lhs.date.toMillis()
}

async function getMeta(gemtext: Path) {
  const file = await gemtext.open()
  const stream = parseByteStream(file.readable)
  const lines: Line[] = []
  for await (const line of stream) {
    if (lines.length >= 3) { break }
    lines.push(line)
  }

  const title = lines[0] && lines[0].type == "heading" && lines[0].level == 1 ? lines[0].text : undefined

  // TODO: Can eventually check for sister meta.gmi file.
  // For now, always read date out of the gemtext.
  // 
  let date: DateTime|undefined = undefined
  for (const line of lines) {
    if (line.type != "text") { continue }
    const maybeDate = parseDate(line.text)
    if (!maybeDate) { continue }
    date = maybeDate
    break
  }

  return {title, date}
}


async function * walkDir(path: Path) {
  const paths = [path]
  while (true) {
    const path = paths.pop()
    if (!path) { break }
    for await (const entry of path.readDir()) {
      if (entry.isDirectory) {
        paths.push(path.join(entry.name))
        continue
      }
      if (entry.isFile) {
        yield entry
      }
    }
  }
}

async function loadConfig(configPath: string) {
  const text = await $.path(configPath).readText();
  const config = Config.assert(toml.parse(text));
  return config;
}

type IndexOptions = typeof IndexOptions.infer
const IndexOptions = type({
  out: type("string").describe(
    "Path relative to the config file where to output an index.gmi",
  ),
  "title?": "string.trim |> string"
  // TODO: header
});

const RssOptions = type({
  out: "string",
  // TODO: "include"
});

type SiteRoot = typeof SiteRoot.infer
const SiteRoot = type({
  path: type("string").describe(
    "The root of your gemtext site. We'll look for posts here.",
  ),
  index: IndexOptions,
  "rss?": RssOptions,
});

type Config = typeof Config.infer;
const Config = type({
  roots: SiteRoot.array().atLeastLength(1),
}).onDeepUndeclaredKey("reject");

const dateFormats = [
  "yyyy-MM-dd h:mma ZZZ",
  "yyyy-MM-dd h:mma ZZ",
  "yyyy-MM-dd h:mma Z",
]

function parseDate(value: string): DateTime | undefined {
  for (const fmt of dateFormats) {
    const dt = DateTime.fromFormat(value, fmt, { setZone: true })
    if (dt.isValid) { return dt }
  }

  return undefined
}
