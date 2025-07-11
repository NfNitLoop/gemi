const fullCommand = [
    "deno", "install", "--global",

    // Upgrade to newer versions if available:
    "--force", 

    // Need Read/Write for the `build` subcommand.
    // Need network for the `serve` command.
    // IIRC Dax & ts-cmd use `env` permissions for configuring terminal output.
    "-RWEN",

    // If a user runs this from a deno project dir, they'll get a warning about a local config.
    // We don't want to use the local config anwyay, we want to use the config in JSR.
    "--no-config",

    // Always grab the latest version.
    "--reload=jsr:@nfnitloop/gemi",

    "jsr:@nfnitloop/gemi"
]

console.log(`We will run this command to install the gemi cli:`)
console.log(JSON.stringify(fullCommand))
console.log()

const cmd = new Deno.Command(fullCommand[0], {
    args: fullCommand.slice(1)
})

const proc = cmd.spawn()
const status = await proc.status
if (!status) {
    Deno.exit(status)
}