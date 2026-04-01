import { spawn } from "node:child_process";
import { mkdir, rm, cp, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const buildDir = path.join(projectRoot, "build");

const filesToCopy = [
    "package.json",
    "package-lock.json",
    "server.js",
    "next.config.ts",
    ".env.production.example",
];

const dirsToCopy = [
    "public",
    "lib/socket",
    "infra/apache",
    "infra/systemd",
];

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: projectRoot,
            stdio: "inherit",
            shell: process.platform === "win32",
        });

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
        });
    });
}

async function exists(relativePath) {
    try {
        await stat(path.join(projectRoot, relativePath));
        return true;
    } catch {
        return false;
    }
}

async function copyPath(relativePath) {
    const source = path.join(projectRoot, relativePath);
    const target = path.join(buildDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
}

async function writeDeployGuide() {
    const guidePath = path.join(buildDir, "DEPLOY-CYBERDUCK.md");
    const guide = [
        "# Deploy via Cyberduck + SSH",
        "",
        "Questa cartella contiene solo i file necessari al runtime in produzione.",
        "",
        "## 1) Upload",
        "",
        "Carica tutto il contenuto di questa cartella nella directory target del server (es. /var/www/ciao-web).",
        "",
        "## 2) Setup server (SSH)",
        "",
        "Esegui nella cartella deployata:",
        "",
        "```bash",
        "npm ci --omit=dev --no-audit --no-fund",
        "cp .env.production.example .env.production",
        "# modifica .env.production con i valori reali",
        "mkdir -p public/uploads public/thumbnails",
        "```",
        "",
        "## 3) Avvio app",
        "",
        "```bash",
        "NODE_ENV=production PORT=3100 npm start",
        "```",
        "",
        "Consigliato: usa systemd o pm2 per tenere il processo attivo dopo il logout.",
        "",
        "## Note",
        "",
        "- I file .env locali non vengono copiati volutamente.",
        "- Upload e thumbnails possono essere persistiti su storage esterno o cartella condivisa.",
        "",
    ].join("\n");

    await writeFile(guidePath, guide, "utf8");
}

async function main() {
    console.log("[1/4] Clean build directory");
    try {
        await rm(buildDir, { recursive: true, force: true });
    } catch (err) {
        if (err.code !== "EBUSY" && err.code !== "EPERM") throw err;
        console.warn(`[1/4] Warning: could not fully clean build dir (${err.code}), continuing...`);
    }
    await mkdir(buildDir, { recursive: true });

    console.log("[2/4] Run production build");
    await run("npm", ["run", "build"]);

    console.log("[3/4] Copy runtime files");
    for (const file of filesToCopy) {
        if (await exists(file)) {
            await copyPath(file);
        }
    }

    for (const dir of dirsToCopy) {
        if (await exists(dir)) {
            await copyPath(dir);
        }
    }

    console.log("[4/4] Write deployment guide");
    await writeDeployGuide();

    console.log("Build package ready:", buildDir);
}

main().catch((error) => {
    console.error("Failed to prepare deploy build:", error);
    process.exit(1);
});
