import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseServerEnvironment } from "@workspace/config";
import { getPool } from "../index";
import {
  provisionInitialOwner,
  recoverOwnerPassword,
} from "../services/owner-provisioning";

let databasePool: ReturnType<typeof getPool> | undefined;

async function promptLine(message: string): Promise<string> {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return (await readline.question(message)).trim();
  } finally {
    readline.close();
  }
}

async function promptHidden(message: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function" || !stdout.isTTY) {
    throw new Error("Owner provisioning requires an interactive terminal.");
  }
  stdout.write(message);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function readPasswordTwice(): Promise<string> {
  const password = await promptHidden("New password (not displayed): ");
  const confirmation = await promptHidden("Confirm new password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  return password;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const { INITIAL_OWNER_EMAIL } = parseServerEnvironment();
  databasePool = getPool();
  if (mode === "provision") {
    process.stdout.write(`This provisions the first Owner for ${INITIAL_OWNER_EMAIL}.\n`);
    const displayName = await promptLine("Owner display name: ");
    const confirmation = await promptLine("Type PROVISION OWNER to continue: ");
    if (confirmation !== "PROVISION OWNER") throw new Error("Provisioning cancelled.");
    const password = await readPasswordTwice();
    const owner = await provisionInitialOwner({
      email: INITIAL_OWNER_EMAIL,
      displayName,
      password,
    });
    process.stdout.write(`Owner account provisioned for ${owner.email}.\n`);
    return;
  }

  if (mode === "recover") {
    process.stdout.write("This changes credentials only for the recorded Owner account.\n");
    const email = await promptLine("Current Owner email: ");
    const confirmation = await promptLine("Type RECOVER OWNER to continue: ");
    if (confirmation !== "RECOVER OWNER") throw new Error("Recovery cancelled.");
    const password = await readPasswordTwice();
    await recoverOwnerPassword({ email, password });
    process.stdout.write("Owner credentials updated and existing sessions revoked.\n");
    return;
  }

  throw new Error("Choose either the provision or recover command.");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Owner command failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  if (databasePool) await databasePool.end();
}
