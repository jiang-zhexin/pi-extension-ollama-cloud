import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    model: {
      type: "string",
      short: "m",
    },
  },
});

console.log(
  await fetch("https://ollama.com/api/show", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  }).then((resp) => resp.json()),
);
