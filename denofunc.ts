const { args } = Deno;
import {
  parse,
  readZip,
  ensureDir,
  move,
  walk,
  readJson,
  writeJson,
  readFileStr,
  writeFileStr,
} from "./deps.ts";

const parsedArgs = parse(Deno.args);

if (parsedArgs["help"]) {
  printHelp();
  Deno.exit();
}

const cacheDir = `${Deno.cwd()}/.cache`;

if (args.length === 1 && args[0] === "init") {
  await initializeFromTemplate();
} else if (
  args.length === 1 && args[0] === "start" ||
  args.length === 2 && `${args[0]} ${args[1]}` === "host start"
) {
  await generateFunctions();
  await createJSBundle();
  await runFunc("start");
} else if (args.length === 2 && args[0] === "publish") {
  const { platform, id } = await getAppPlatform(args[1]);
  updateHostJson(platform);
  await downloadBinary(platform);
  await generateFunctions();
  await createJSBundle();
  await cacheDependencies(platform, id);
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

async function createJSBundle() {
  const bundleFileName = "worker.bundle.js";
  const cmd = ["deno", "bundle", "--unstable", "worker.ts", bundleFileName];
  console.info(`Running command: ${cmd.join(" ")}`);
  const generateProcess = Deno.run({ cmd });
  await generateProcess.status();
}

async function getAppPlatform(appName: string): Promise<any> {
  console.info(`Checking platform type of : ${appName} ...`);
  const azResourceCmd = [
    "az",
    "resource",
    "list",
    "--resource-type",
    "Microsoft.web/sites",
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
    const id = resources.filter((resource: any) =>
      resource.name === appName
    )[0].id;
    const azFunctionCmd = [
      "az",
      "functionapp",
      "config",
      "show",
      "--ids",
      id,
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
    return {
      platform: !config.linuxFxVersion ? "windows" : "linux",
      id
    };
  } catch {
    throw new Error(`Not found: ${appName}`);
  }
}

async function updateHostJson(platform: string) {
  // update `defaultExecutablePath` in host.json
  const hostJsonPath = "./host.json";
  if (!(await fileExists(hostJsonPath))) {
    throw new Error(`\`${hostJsonPath}\` not found`);
  }

  const hostJSON: any = await readJson(hostJsonPath);
  hostJSON.httpWorker.description.defaultExecutablePath = platform === "windows"
    ? "D:\\home\\site\\wwwroot\\bin\\windows\\deno.exe"
    : "/home/site/wwwroot/bin/linux/deno",
    await writeJson(hostJsonPath, hostJSON, { spaces: 2 }); // returns a promise
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

  const binZipPath = `${binDir}/deno.zip`;
  if (!(await fileExists(binPath))) {
    const downloadUrl =
      `https://github.com/denoland/deno/releases/download/v${Deno.version.deno}/deno-x86_64-${
        archive[platform]
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

async function initializeFromTemplate() {
  const templateZipPath = `./template.zip`;

  let isEmpty = true;
  for await (const dirEntry of Deno.readDir(".")) {
    isEmpty = false;
  }

  if (isEmpty) {
    console.info("Initializing project...");
    // download deno binary (that gets deployed to Azure)
    const response = await fetch(
      "https://github.com/anthonychu/azure-functions-deno-template/archive/master.zip",
    );
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
    console.error("Cannot initialize. Folder is not empty.");
  }
}

async function generateFunctions() {
  console.info("Generating functions...");
  try {
    await Deno.remove(cacheDir, {recursive: true});
  } catch {}
  const generateProcess = Deno.run({
    cmd: [
      "deno",
      "run",
      "--allow-net",
      "--allow-env",
      "--allow-read",
      "--allow-write",
      "--unstable",
      "worker.ts",
    ],
    env: {
      "DENOFUNC_GENERATE": "1",
      "DENO_DIR": cacheDir // specify output dir
    },
  });
  await generateProcess.status();
}

async function cacheDependencies(platform: string, id: string) {
  // update app setting `DENO_DIR` settings for cache files
  const azFuncCmd = [
    "az",
    "functionapp",
    "config",
    "appsettings",
    "set",
    "--ids",
    id,
    "-o",
    "json",
    "--settings",
  ];
  if (platform === 'windows') {
    azFuncCmd.push("DENO_DIR=D:\\home\\site\\wwwroot\\.cache");
  } else {
    azFuncCmd.push("DENO_DIR=/home/site/wwwroot/.cache");
  }

  const azFuncProcess = await runWithRetry(
    { cmd: azFuncCmd, stdout: "piped" },
    "az.cmd",
  );
  await azFuncProcess.output();
  azFuncProcess.close();

  const paths = {
      from: Deno.cwd().replace(/\\/g, '\\\\') as string,
      to: {
        metafile: platform === 'windows' ? 'D:\\\\home\\\\site\\\\wwwroot' : '/home/site/wwwroot',
        others: platform === 'windows' ? '/D:/home/site/wwwroot' : '/home/site/wwwroot'
      }
  }
  const cachefiles = [];
  // remove files contained in worker.ts.* from cache dir
  for await (const w of walk(`${Deno.cwd()}/.cache/gen/file`, {includeDirs: false})) {
    if (w.path.match(/[\\\/]worker\.ts.*$/)) {
      await Deno.remove(w.path);
      continue;
    }
    cachefiles.push(w.path);
  }

  // replace path in cached files
  for (const cachefile of cachefiles) {
    const content = await readFileStr(cachefile);
    const updated = cachefile.endsWith('.meta')
      ? content.replace(new RegExp(paths.from.replace(/\\/g, '\\\\'), 'g'), paths.to.metafile).replace(/\\\\/g, () => platform === 'windows' ? '\\\\' : '/')
      : content.replace(new RegExp(`/${paths.from.replace(/\\\\/g, '/')}`, 'g'), paths.to.others);
    await writeFileStr(cachefile, updated || '');
  };

  // move cached files to following dir
  //   windows: .cache/gen/file/D/home/site/wwwroot/
  //   linux: .cache/gen/file/home/site/wwwroot/
  const remoteCacheDir = `${cacheDir}/gen/file${paths.to.others.replace(/:/g, '')}`;
  try {
    await Deno.lstat(remoteCacheDir);
  } catch {
    await Deno.mkdir(remoteCacheDir, {recursive: true});
  }
  await move(`${cacheDir}/gen/file/${Deno.cwd().replace(/:/g, '')}`, remoteCacheDir, { overwrite: true });

  // remove empty dirs in ./.cache/gen/file/PATH/TO/WORK_DIR
  let removeDir = `${cacheDir}/gen/file/${Deno.cwd().replace(/:/g, '')}`.replace(/[\\/][^\\/]+$/, '');
  while (true) {
    try {
      await Deno.remove(removeDir);
      removeDir = removeDir.replace(/[\\/][^\\/]+$/, '');
    } catch {
      break;
    }
  }
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
        `Could not start ${
          runOptions.cmd[0]
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
        const newCmd = [...runOptions.cmd];
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

async function publishApp(appName: string) {
  await runFunc(
    "azure",
    "functionapp",
    "publish",
    appName,
    "--no-build",
    "-b",
    "local",
    "--force",
  );
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
    Publish to Azure
    `);
}
