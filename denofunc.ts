const { args } = Deno;
import { parse } from "./deps.ts";
import { readZip } from "./deps.ts";
import { ensureDir } from "./deps.ts";

const parsedArgs = parse(Deno.args);

if (parsedArgs["help"]) {
    console.log("print help");
}

if (args.length === 1 && args[0] === "init") {
    await initProject();
} else if (args.length === 1 && args[0] === "start"
        || args.length === 2 && `${args[0]} ${args[1]}` === "host start") {
    await generateFunctions();
    await runFunc("start");
}

async function fileExists(path: string) {
    try {
        const f = await Deno.lstat(path);
        return f.isFile;
    } catch {
        return false;
    }
}

async function initProject() {
    const binDir = "./bin/linux";
    const binPath = `${binDir}/deno`;
    const binZipPath = `${binDir}/deno.zip`;

    if (!(await fileExists(binPath))) {
        // download deno binary (that gets deployed to Azure)
        const response = await fetch(`https://github.com/denoland/deno/releases/download/v${Deno.version.deno}/deno-x86_64-unknown-linux-gnu.zip`)
        await ensureDir(binDir);
        const zipFile = await Deno.create(binZipPath);
        const download = new Deno.Buffer(await response.arrayBuffer());
        await Deno.copy(download, zipFile);
        Deno.close(zipFile.rid);

        const zip = await readZip(binZipPath);

        await zip.unzip(binDir);
        await Deno.chmod(binPath, 0o755)
        await Deno.remove(binZipPath);
    }
}

async function generateFunctions() {
    const generateProcess = Deno.run({
        cmd: ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--unstable", "worker.ts"],
        env: { "DENOFUNC_GENERATE": "1" }
    });
    
    await generateProcess.status();
}

async function runFunc(...args: string[]) {
    const proc = Deno.run({
        cmd: [ "func", ...args ]
    });

    await proc.status();
}