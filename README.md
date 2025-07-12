# Gemi

The `gemi` command serves gemtext sites over HTTP. It will serve text/gemini to any client that requests it, or doesn't specify a preferred Content-Type. It will transform gemtext to HTML on the fly for clients that only accept text/html.

See: <https://www.nfnitloop.com/blog/2025/06/project-gemini/>

## Features

### Gemtext + HTML

The best Gemtext browser is the one you already have:

```
> curl https://nfnitloop.com 
# nfnitloop.com

Hi! I'm Cody. I'm a software engineer in southern California.

### Links
=> resume/
=> blog/
[...]
```

But, if you only have a web browser at hand, `gemi serve` will translate the gemtext to HTML automatically:

<https://nfnitloop.com/>

### HTML Styles

You can drop a `style.css` in the root of the directory served by `gemi serve`, and gemi will use it to style HTML when operating in that mode. If you don't, you'll get a minimalist default style that just makes sure the rendered HTML looks similar to how a Gemini browser would render gemtext.

Styles are inlined into each document as requested, to stick with Gemini's convention – fetching and rendering one document only needs one HTTP request.

### Blog indexes

`gemi build` Grabs titles and dates from gemtexts in a directory and creates a chronologically-ordered index for them.

(TODO: Better docs/examples here)

Example:
```toml
# file: .gemi.toml
# `gemi build` will look for this in the current directory.

# You can specify multiple "roots" to index.
[[roots]]
path = "./blog"

# Where to write the index (relative to root.path)
index.out = "index.gmi"
index.title = "blog/"

# Not yet implemented. (Coming soon?)
rss.out = "atom.xml"
```

This results in a gemtext index like:

```
> curl https://nfnitloop.com/blog/
# blog/

=> 2025/07/american-absurdities/ 2025-07-02 American Absurdities
=> 2025/06/project-gemini/ 2025-06-25 Thoughts on Project Gemini
=> 2025/01/diskuto/ 2025-01-26 Diskuto!
=> 2023/04/golang-still-not-a-fan/ 2023-04-15 Golang: (Still) Not a Fan
```

### Gemini Protocol Too

Since `gemi` serves gemini files over HTTP (or HTTPS, via a configured web proxy), it can coexist with a separate Gemini Protocol server. You can serve the same files on both HTTP(S) (80/443) ports and the Gemini protocol port (1965).

## Installation

    deno jsr:@nfnitloop/gemi/install

## Local File Server

 * `cd` into a directory (preferably with some .gmi files!)
 * `gemi serve`
 * Visit the URL in your browser to see rendered gemini files.
 * `gemi serve --help` for options.

## Web Server

The process here is the same as the "Local File Server". Just configure your web server to act as an HTTP proxy to whichever port you start up the "local" server on.
