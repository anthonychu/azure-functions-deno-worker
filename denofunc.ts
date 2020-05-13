const { args } = Deno;
import { parse, readZip, ensureDir, move, walk } from "./deps.ts";

const parsedArgs = parse(Deno.args);

if (parsedArgs["help"]) {
    printHelp();
    Deno.exit();
}

if (args.length === 1 && args[0] === "init") {
    await initializeFromTemplate();
} else if (args.length === 1 && args[0] === "start"
    || args.length === 2 && `${args[0]} ${args[1]}` === "host start") {
    await generateFunctions();
    await createJSBundle();
    await runFunc("start");
} else if (args.length === 2 && args[0] === "publish") {
    await downloadBinary();
    await generateFunctions();
    await createJSBundle();
    await publishApp(args[1]);
} else {
    printHelp();
}

async function fileExists(path: string) {
    try {
        const f = await Deno.lstat(path);
        return f.isFile;
    } catch {
        return false;
    }
}

async function createJSBundle() {
    const bundleFileName = "worker.bundle.js";
    const cmd = ["deno", "bundle", "--unstable", "worker.ts", bundleFileName];
    console.info(`Running command: ${cmd.join(" ")}`);
    const generateProcess = Deno.run({ cmd });
    await generateProcess.status();
}

async function downloadBinary() {
    const binDir = "./bin/linux";
    const binPath = `${binDir}/deno`;
    const binZipPath = `${binDir}/deno.zip`;

    if (!(await fileExists(binPath))) {
        const downloadUrl = `https://github.com/denoland/deno/releases/download/v${Deno.version.deno}/deno-x86_64-unknown-linux-gnu.zip`;
        console.info(`Downloading deno binary from: ${downloadUrl} ...`);
        // download deno binary (that gets deployed to Azure)
        const response = await fetch(downloadUrl);
        await ensureDir(binDir);
        const zipFile = await Deno.create(binZipPath);
        const download = new Deno.Buffer(await response.arrayBuffer());
        await Deno.copy(download, zipFile);
        Deno.close(zipFile.rid);

        const zip = await readZip(binZipPath);

        await zip.unzip(binDir);
        await Deno.chmod(binPath, 0o755)
        await Deno.remove(binZipPath);
        console.info(`Downloaded deno binary at: ${await Deno.realPath(binPath)}`);
    }
}

async function initializeFromTemplate() {
    const templateZipPath = `./template.zip`;

    let isEmpty = true;
    for await (const dirEntry of Deno.readDir(".")) {
        isEmpty = false;
    }

    if (isEmpty) {
        console.info("Initializing project...");
        // download deno binary (that gets deployed to Azure)
        const response = await fetch("https://github.com/anthonychu/azure-functions-deno-template/archive/master.zip");
        const zipFile = await Deno.create(templateZipPath);
        const download = new Deno.Buffer(await response.arrayBuffer());
        await Deno.copy(download, zipFile);
        Deno.close(zipFile.rid);

        const zip = await readZip(templateZipPath);

        const subDirPath = "azure-functions-deno-template-master";

        await zip.unzip(".");
        await Deno.remove(templateZipPath);

        for await (const entry of walk(".")) {
            if (entry.path.startsWith(subDirPath) && entry.path !== subDirPath) {
                const dest = entry.path.replace(subDirPath, ".");
                console.info(dest);
                if (entry.isDirectory) {
                    await Deno.mkdir(dest, { recursive: true });
                } else {
                    await move(entry.path, dest);
                }
            }
        }
        await Deno.remove(subDirPath, { recursive: true });
    } else {
        console.error("Cannot initialize. Folder is not empty.")
    }
}

async function generateFunctions() {
    console.info("Generating functions...");
    const generateProcess = Deno.run({
        cmd: ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--unstable", "worker.ts"],
        env: { "DENOFUNC_GENERATE": "1" }
    });
    await generateProcess.status();
}

async function runFunc(...args: string[]) {
    const cmd = ["func", ...args];
    console.info(`Starting Azure Functions Core Tools: ${cmd.join(" ")}`);
    const proc = Deno.run({ cmd });
    await proc.status();
}

async function publishApp(appName: string) {
    const cmd = ["func", "azure", "functionapp", "publish", appName, "--no-build", "-b", "local", "--force"];
    console.info(`Publishing app: ${cmd.join(" ")}`);
    const proc = Deno.run({ cmd });
    await proc.status();
}

function printLogo() {
    const logo = `
           @@@@@@@@@@@,         
       @@@@@@@@@@@@@@@@@@@                        %%%%%%%%%%%%
     @@@@@@        @@@@@@@@@@                     %%%%%%%%%%%%
   @@@@@ @  @           *@@@@@              @   %%%%%%%%%%%%    @
   @@@                    @@@@@           @@   %%%%%%%%%%%%      @@
  @@@@@                   @@@@@        @@@    %%%%%%%%%%%%%%%%%%%%%%    @@@
  @@@@@@@@@@@@@@@          @@@@      @@      %%%%%%%%%%%%%%%%%%%%        @@
   @@@@@@@@@@@@@@          @@@@        @@         %%%%%%%%       @@
    @@@@@@@@@@@@@@         @@@           @@      %%%%%%       @@
     @@@@@@@@@@@@@         @               @@    %%%%      @@
       @@@@@@@@@@@                              %%%%
            @@@@@@@                             %%        
    `;
    console.info(logo);
}

function printHelp() {
    printLogo();
    console.info("Deno for Azure Functions - CLI");
    console.info(`
Commands:

denofunc --help
    This screen

denofunc init
    Initialize project in an empty folder

denofunc start
    Generate functions artifacts and start Azure Functions Core Tools

denofunc publish <function_app_name>
    Publish to Azure (Linux Consumption plan only)
    `);
}