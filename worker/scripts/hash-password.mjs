import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ITERATIONS = 310000;
const rl = createInterface({ input, output });
const password = await rl.question("输入 Apex 登录密码（不会写入文件）：");
rl.close();
if (!password) throw new Error("密码不能为空");

const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const b64 = (value) => value.toString("base64url");
console.log(`pbkdf2-sha256$${ITERATIONS}$${b64(salt)}.${b64(derived)}`);