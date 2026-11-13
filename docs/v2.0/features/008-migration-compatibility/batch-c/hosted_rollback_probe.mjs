// Hosted DEV rollback-only pgTAP probe (D-7B). Runs ONE reviewed pgTAP file inside a transaction whose LAST statement
// always raises (so the transaction can never commit). Prints only counts. Refuses if the file contains commit/DDL against real objects.
import fs from "node:fs";
const REF = "opmujepkemwcdxxorhfd";
const [, , file, expectedPlan] = process.argv;
const token = process.env.LINEUP_SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("no token");
let sql = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
if (/^\s*commit\b/im.test(sql))
  throw new Error("refused: file contains COMMIT");
if (!/^\s*begin;/i.test(sql))
  throw new Error("refused: file does not start with begin;");
// drop the file's own trailing finish()/rollback; the wrapper ends in a raising DO block instead
sql = sql.replace(/select \* from finish\(\);\s*rollback;\s*$/i, "");
if (/\bfinish\(\)|\brollback\b\s*;\s*$/i.test(sql.slice(-200)))
  throw new Error("unexpected file tail");
sql = sql.replace(
  /^\s*begin;/i,
  "begin; set local lock_timeout='5s'; set local statement_timeout='120s';",
);
sql += `\ndo $r$ begin raise exception 'RESULT:%', jsonb_build_object('run', extensions._get('curr_test'), 'failed', extensions.num_failed(), 'user', current_user); end $r$;\nrollback;\n`;
const res = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/database/query`,
  {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);
const text = await res.text();
const m = text.match(/RESULT:(\{.*?\})/);
if (!m) {
  console.log(
    "NO RESULT; status",
    res.status,
    text.replace(/postgres(ql)?:\/\/\S+/g, "[x]").slice(0, 700),
  );
  process.exit(1);
}
const r = JSON.parse(
  m[1].split(String.fromCharCode(92, 34)).join(String.fromCharCode(34)),
);
const ok = r.failed === 0 && r.run === Number(expectedPlan);
console.log(
  `${file.split(/[\/]/).pop()}: run=${r.run} failed=${r.failed} expected=${expectedPlan} as=${r.user} -> ${ok ? "PASS" : "FAIL"}`,
);
process.exit(ok ? 0 : 1);
