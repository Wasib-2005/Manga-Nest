import { readFile, writeFile } from "node:fs/promises";

const [command, nextVersion] = process.argv.slice(2);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readVersions() {
  const [packageJson, appJson, env] = await Promise.all([
    readJson("package.json"),
    readJson("app.json"),
    readFile(".env", "utf8"),
  ]);
  const envVersion = env.match(/^EXPO_PUBLIC_APP_VERSION=(.+)$/m)?.[1]?.trim() ?? "";

  return {
    packageVersion: packageJson.version,
    appVersion: appJson.expo?.version,
    envVersion,
    packageJson,
    appJson,
    env,
  };
}

function printVersions({ packageVersion, appVersion, envVersion }) {
  console.log(`package.json: ${packageVersion}`);
  console.log(`app.json:     ${appVersion}`);
  console.log(`.env:         ${envVersion}`);
}

async function check() {
  const versions = await readVersions();
  printVersions(versions);
  const matches = versions.packageVersion === versions.appVersion
    && versions.packageVersion === versions.envVersion;

  if (!matches) {
    console.error("Version mismatch. Run: npm run version:set -- <major.minor.patch>");
    process.exitCode = 1;
    return;
  }

  console.log(`Version ${versions.packageVersion} is ready for release.`);
}

async function setVersion() {
  if (!nextVersion || !versionPattern.test(nextVersion)) {
    console.error("Use a semantic version such as: npm run version:set -- 1.1.1");
    process.exitCode = 1;
    return;
  }

  const versions = await readVersions();
  versions.packageJson.version = nextVersion;
  versions.appJson.expo.version = nextVersion;
  const nextEnv = versions.env.match(/^EXPO_PUBLIC_APP_VERSION=/m)
    ? versions.env.replace(/^EXPO_PUBLIC_APP_VERSION=.*$/m, `EXPO_PUBLIC_APP_VERSION=${nextVersion}`)
    : `${versions.env.trimEnd()}\nEXPO_PUBLIC_APP_VERSION=${nextVersion}\n`;

  await Promise.all([
    writeJson("package.json", versions.packageJson),
    writeJson("app.json", versions.appJson),
    writeFile(".env", nextEnv),
  ]);

  console.log(`Set release version to ${nextVersion}.`);
  await check();
}

if (command === "check") {
  await check();
} else if (command === "set") {
  await setVersion();
} else {
  console.error("Usage: npm run version:check | npm run version:set -- <major.minor.patch>");
  process.exitCode = 1;
}
