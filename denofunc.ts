import {
  parse,
  readZip,
  ensureDir,
  move,
  walk,
} from "./deps.ts";

const shouldBundle = false;
const baseExecutableFileName = "worker";
const bundleFileName = "worker.bundle.js";
const commonDenoOptions = ["--allow-env", "--allow-net", "--allow-read"]
const parsedArgs = parse(Deno.args);

if (parsedArgs._[0] === "help") {
  printHelp();
  Deno.exit();
}

if (parsedArgs._.length >= 1 && parsedArgs._[0] === "init") {
  const templateDownloadBranch: string | undefined = parsedArgs?._[1]?.toString();
  await initializeFromTemplate(templateDownloadBranch);
} else if (
  parsedArgs._.length === 1 && parsedArgs._[0] === "start" ||
  parsedArgs._.length === 2 && parsedArgs._.join(' ') === "host start"
) {
  await generateFunctions();
  await createJSBundle();
  await runFunc("start");
} else if (parsedArgs._[0] === "publish" && parsedArgs._.length === 2) {
  const bundleStyle = parsedArgs["bundle-style"] || "executable";
  if (!["executable", "jsbundle", "none"].includes(bundleStyle)) {
    console.error(`The value \`${parsedArgs["bundle-style"]}\` of \`--bundle-style\` option is not acceptable.`)
    Deno.exit(1);
  }
  const appName = parsedArgs._[1].toString();
  const slotName = parsedArgs["slot"]?.toString();
  const platform = await getAppPlatform(appName, slotName);
  if (!["windows", "linux"].includes(platform)) {
    console.error(`The value \`${platform}\` for the function app \`${appName + (slotName ? `/${slotName}` : "")}\` is not valid.`);
    Deno.exit(1);
  }
  await updateHostJson(platform, bundleStyle);
  await generateFunctions();

  if (bundleStyle === "executable") {
    await generateExecutable(platform);
  } else {
    await downloadBinary(platform);
    if (bundleStyle === "jsbundle") await createJSBundle();
  }
  await publishApp(appName, slotName);
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

async function directoryExists(path: string) {
  try {
    const f = await Deno.lstat(path);
    return f.isDirectory;
  } catch {
    return false;
  }
}

async function listFiles(dir: string) {
  const files: string[] = [];
  for await (const dirEntry of Deno.readDir(dir)) {
    files.push(`${dir}/${dirEntry.name}`);
    if (dirEntry.isDirectory) {
      (await listFiles(`${dir}/${dirEntry.name}`)).forEach((s) => {
        files.push(s);
      });
    }
  }
  return files;
}

async function generateExecutable(platformArg?: string) {
  try {
    await Deno.remove('./bin', { recursive: true });
    await Deno.remove(`./${bundleFileName}`);
  } catch { }

  const platform = platformArg || Deno.build.os;
  await Deno.mkdir(`./bin/${platform}`, { recursive: true });

  const cmd = [
    "deno",
    "compile",
    "--unstable",
    "--lite",
    ...commonDenoOptions,
    "--output",
    `./bin/${platform}/${baseExecutableFileName}`,
    ...(['windows', 'linux'].includes(platform)
      ? ['--target', platform === 'windows' ? 'x86_64-pc-windows-msvc' : 'x86_64-unknown-linux-gnu']
      : []
    ),
    "worker.ts"
  ];
  cmd.push("worker.ts");
  console.info(`Running command: ${cmd.join(" ")}`);
  const generateProcess = Deno.run({ cmd });
  await generateProcess.status();
}

async function createJSBundle() {
  const cmd = ["deno", "bundle", "--unstable", "worker.ts", bundleFileName];
  console.info(`Running command: ${cmd.join(" ")}`);
  const generateProcess = Deno.run({ cmd });
  await generateProcess.status();
}

async function getAppPlatform(appName: string, slotName?: string): Promise<string> {
  console.info(`Checking platform type of : ${appName + (slotName ? `/${slotName}` : "")} ...`);
  const azResourceCmd = [
    "az",
    "resource",
    "list",
    "--resource-type",
    `Microsoft.web/sites${slotName ? "/slots" : ""}`,
    "-o",
    "json",
  ];
  const azResourceProcess = await runWithRetry(
    { cmd: azResourceCmd, stdout: "piped" },
    "az.cmd",
  );
  const azResourceOutput = await azResourceProcess.output();
  const resources = JSON.parse(
    new TextDecoder().decode(azResourceOutput),
  );
  azResourceProcess.close();

  try {
    const resource = resources.find((resource: any) =>
      resource.name === (appName + (slotName ? `/${slotName}` : ""))
    );

    if ((resource.kind as string).includes("linux")) {
      return "linux";
    }

    const azFunctionCmd = [
      "az",
      "functionapp",
      "config",
      "show",
      "--ids",
      resource.id,
      "-o",
      "json",
    ];
    const azFunctionProcess = await runWithRetry(
      { cmd: azFunctionCmd, stdout: "piped" },
      "az.cmd",
    );
    const azFunctionOutput = await azFunctionProcess.output();
    const config = JSON.parse(
      new TextDecoder().decode(azFunctionOutput),
    );
    azFunctionProcess.close();

    const azFunctionAppSettingsCmd = [
      "az",
      "functionapp",
      "config",
      "appsettings",
      "set",
      "--ids",
      resource.id,
      "--settings",
      "WEBSITE_LOAD_USER_PROFILE=1",
      "-o",
      "json",
    ];
    const azFunctionAppSettingsProcess = await runWithRetry(
      { cmd: azFunctionAppSettingsCmd, stdout: "null" },
      "az.cmd",
    );
    await azFunctionAppSettingsProcess.status();
    azFunctionAppSettingsProcess.close();

    return "windows";
  } catch {
    throw new Error(`Not found: ${appName + (slotName ? `/${slotName}` : "")}`);
  }
}

async function updateHostJson(platform: string, bundleStyle: string) {
  // update `defaultExecutablePath` and `arguments` in host.json
  const hostJsonPath = "./host.json";
  if (!(await fileExists(hostJsonPath))) {
    throw new Error(`\`${hostJsonPath}\` not found`);
  }

  const hostJSON: any = await readJson(hostJsonPath);
  if (!hostJSON.customHandler) hostJSON.customHandler = {};
  hostJSON.customHandler.description = {
    defaultExecutablePath: `bin/${platform}/${bundleStyle === "executable" ? baseExecutableFileName : "deno"}${platform === "windows" ? ".exe" : ""}`,
    arguments: bundleStyle === "executable"
      ? []
      : [
        "run",
        ...commonDenoOptions,
        bundleStyle === "jsbundle" ? bundleFileName : "worker.ts"
      ]
  };

  await writeJson(hostJsonPath, hostJSON); // returns a promise
}

function writeJson(path: string, data: object): void {
  Deno.writeTextFileSync(path, JSON.stringify(data, null, 2));
}

function readJson(path: string): string {
  const decoder = new TextDecoder("utf-8");
  return JSON.parse(decoder.decode(Deno.readFileSync(path)));
}

async function downloadBinary(platform: string) {
  const binDir = `./bin/${platform}`;
  const binPath = `${binDir}/deno${platform === "windows" ? ".exe" : ""}`;
  const archive: any = {
    "windows": "pc-windows-msvc",
    "linux": "unknown-linux-gnu",
  };

  // remove unnecessary files/dirs in "./bin"
  if (await directoryExists("./bin")) {
    const entries = (await listFiles("./bin"))
      .filter((entry) => !binPath.startsWith(entry))
      .sort((str1, str2) => str1.length < str2.length ? 1 : -1);
    for (const entry of entries) {
      await Deno.remove(entry);
    }
  }
  try {
    await Deno.remove(`./${bundleFileName}`);
  } catch { }

  const binZipPath = `${binDir}/deno.zip`;
  if (!(await fileExists(binPath))) {
    const downloadUrl =
      `https://github.com/denoland/deno/releases/download/v${Deno.version.deno}/deno-x86_64-${archive[platform]
      }.zip`;
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

    if (Deno.build.os !== "windows") {
      await Deno.chmod(binPath, 0o755);
    }

    await Deno.remove(binZipPath);
    console.info(`Downloaded deno binary at: ${await Deno.realPath(binPath)}`);
  }
}

async function initializeFromTemplate(downloadBranch: string = "main") {
  const templateZipPath = `./template.zip`;
  const templateDownloadPath = `https://github.com/anthonychu/azure-functions-deno-template/archive/${downloadBranch}.zip`;
  let isEmpty = true;
  for await (const dirEntry of Deno.readDir(".")) {
    isEmpty = false;
  }

  if (isEmpty) {
    console.info("Initializing project...");
    console.info(`Downloading from ${templateDownloadPath}...`);
    // download deno binary (that gets deployed to Azure)
    const response = await fetch(templateDownloadPath);
    const zipFile = await Deno.create(templateZipPath);
    const download = new Deno.Buffer(await response.arrayBuffer());
    await Deno.copy(download, zipFile);
    Deno.close(zipFile.rid);

    const zip = await readZip(templateZipPath);

    const subDirPath = `azure-functions-deno-template-${downloadBranch}`;

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
    console.error("Cannot initialize. Folder is not empty.");
  }
}

async function generateFunctions() {
  console.info("Generating functions...");
  const generateProcess = Deno.run({
    cmd: [
      "deno",
      "run",
      ...commonDenoOptions,
      "--allow-write",
      "--unstable",
      "--no-check",
      "worker.ts",
    ],
    env: { "DENOFUNC_GENERATE": "1" },
  });
  await generateProcess.status();
}

async function runFunc(...args: string[]) {
  let cmd = ["func", ...args];
  const env = {
    "logging__logLevel__Microsoft": "warning",
    "logging__logLevel__Worker": "warning",
  };

  const proc = await runWithRetry({ cmd, env }, "func.cmd");
  await proc.status();
  proc.close();
}

async function runWithRetry(
  runOptions: Deno.RunOptions,
  backupCommand: string,
) {
  try {
    console.info(`Running command: ${runOptions.cmd.join(" ")}`);
    return Deno.run(runOptions);
  } catch (ex) {
    if (Deno.build.os === "windows") {
      console.info(
        `Could not start ${runOptions.cmd[0]
        } from path, searching for executable...`,
      );
      const whereCmd = ["where.exe", backupCommand];
      const proc = Deno.run({
        cmd: whereCmd,
        stdout: "piped",
      });
      await proc.status();
      const rawOutput = await proc.output();
      const newPath = new TextDecoder().decode(rawOutput).split(/\r?\n/).find(
        (p) => p.endsWith(backupCommand),
      );
      if (newPath) {
        const newCmd = [...runOptions.cmd].map(e => e.toString());
        newCmd[0] = newPath;
        const newOptions = { ...runOptions };
        newOptions.cmd = newCmd;
        console.info(`Running command: ${newOptions.cmd.join(" ")}`);
        return Deno.run(newOptions);
      } else {
        throw `Could not locate ${backupCommand}. Please ensure it is installed and in the path.`;
      }
    } else {
      throw ex;
    }
  }
}

async function publishApp(appName: string, slotName?: string) {
  const runFuncArgs = [
    "azure",
    "functionapp",
    "publish",
    appName
  ];
  await runFunc(...(slotName ? runFuncArgs.concat(["--slot", slotName]) : runFuncArgs));
}

function printLogo() {
  const logo = `
           @@@@@@@@@@@,
       @@@@@@@@@@@@@@@@@@@                        %%%%%%
     @@@@@@        @@@@@@@@@@                    %%%%%%
   @@@@@ @  @           *@@@@@              @   %%%%%%    @
   @@@                    @@@@@           @@   %%%%%%      @@
  @@@@@                   @@@@@        @@@    %%%%%%%%%%%    @@@
  @@@@@@@@@@@@@@@          @@@@      @@      %%%%%%%%%%        @@
   @@@@@@@@@@@@@@          @@@@        @@         %%%%       @@
    @@@@@@@@@@@@@@         @@@           @@      %%%       @@
     @@@@@@@@@@@@@         @               @@    %%      @@
       @@@@@@@@@@@                              %%
            @@@@@@@                             %
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

denofunc publish <function_app_name> [options]
    Publish to Azure
    options:
      --slot         <slot_name>              Specify name of the deployment slot
      --bundle-style executable|jsbundle|none Select bundle style on deployment 
        executable(default): Bundle as one executable
        jsbundle:            Bundle as one javascript worker & Deno runtime
        none:                No bundle
    `);
}
